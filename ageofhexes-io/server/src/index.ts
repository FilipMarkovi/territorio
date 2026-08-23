import { WebSocketServer, type WebSocket } from "ws";
import { MAX_INTENTS_PER_SECOND, COINS_REWARD_WIN, COINS_REWARD_LOSS, MINIMUM_SURVIVAL_TIME_FOR_COINS } from "../../system/core/serverConstants.js";
import crypto from "node:crypto";
import {
  applyIntent,
  executePreparedSpecialAttack,
  tick,
  createWireStateDelta,
  serializeState,
  MAPS,
  handlePlayerDeath,
  setPlayer, startHQPlacementCountdown,
  buildWaterNetwork,
  type WireStateDelta,
  type WireState,
  checkGameOver
} from "../../system/index.js";
import { STARTING_GOLD, STARTING_ARMY, TICK_RATE } from "../../shared/constants.js";
import { initMap } from "./init/initMap.js";
import { RoomId, GameRoom, createRoom  } from "./util/rooms.js";
import { runBots } from "./ai/botManager.js";
import { handleQueueBots, fillRoomWithBots, cancelQueueBots, getQueueAutofillDeadline } from "./ai/queueBotManager.js";
import { PlayerId } from "../../shared/index.js";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from './database/db.js';
import { privateRoomCodes, createPrivateRoom } from "./util/rooms.js";
import { getNextAvailablePlayerColor } from "./util/playerColors.js";

const __filename = fileURLToPath(import.meta.url);

const PORT = 6767; // port
const app = express();


const server =app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


type ClientMsg =
  | { type: "INTENT"; intent: any }
  | { type: "AUTH", token: string, }
  | { type: "PING"; t: number };

export type ServerMsg =
  | { type: "WELCOME"; playerId: string; requiredPlayers: number; roomId: string }
  | { type: "LOBBY"; connected: number; required: number; roomId: string; matchStartAt: number | null; serverTime: number }
  | { type: "STATE"; full: true; state: WireState; serverTime?: number }
  | { type: "STATE"; full: false; delta: WireStateDelta; serverTime?: number }
  | { type: "PONG"; t: number; serverTime: number }
  | {
      type: "SPECIAL_ATTACK_LAUNCHED";
      attackType: string;
      casterId: string;
      sourceQ: number;
      sourceR: number;
      targetQ: number;
      targetR: number;
      travelMs: number;
      serverTime?: number;
    }
  | { type: "COINS_UPDATE"; coins: number };

interface AuthenticatedSession {
  dbId: string;      
  coins: number;
  lastSavedCoins: number; // coins value already persisted to the database
  username: string;
}

function sendCoinsUpdate(playerId: PlayerId, coins: number) {
  const socket = sockets.get(playerId);
  if (socket && socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify({ type: "COINS_UPDATE", coins } satisfies ServerMsg));
  }
}

async function persistPlayerCoins(session: AuthenticatedSession) {
  if (session.coins === session.lastSavedCoins) return;

  const coinsToSave = session.coins;
  const { error } = await supabase
    .from("players")
    .update({ coins: coinsToSave })
    .eq("id", session.dbId);

  if (error) {
    console.error(`[SUPABASE ERROR] Failed to save coins for ${session.dbId}:`, error.message);
    return;
  }

  session.lastSavedCoins = coinsToSave;
}

function resolveJoinUsername(playerId: PlayerId, requestedUsername: string): string {
  const session = authSessions.get(playerId);
  if (session?.username) {
    return session.username;
  }

  const guestName = typeof requestedUsername === "string" ? requestedUsername.trim() : "";
  return guestName.length > 0 ? guestName : "Guest";
}

function applyTrackedUsernameToActiveRoom(playerId: PlayerId, username: string) {
  const roomId = playerRoom.get(playerId);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) return;

  const player = room.state.players.get(playerId);
  if (!player) return;

  player.username = username;

  if (room.privateSettings && !room.state.started) {
    broadcastPrivateRoomLobby(room);
    return;
  }

  if (room.state.started) {
    broadcastRoomState(room, true);
  }
}

const authSessions = new Map<PlayerId, AuthenticatedSession>();
const rooms = new Map<RoomId, GameRoom>();
let queueRoomId: RoomId;
const playerRoom = new Map<PlayerId, RoomId>(); // player -> room
const sockets = new Map<PlayerId, WebSocket>();
const socketLifetime = new Map<PlayerId, number>(); // player -> time when websocket was created
const intentHistory = new Map<PlayerId, number[]>();

const wss = new WebSocketServer({
  server,
  verifyClient: (info, callback) => {
    const origin = info.req.headers.origin;
    if (
      !origin ||
      origin.includes("localhost") ||
      origin.includes("ageofhexes.io") ||
      origin.includes("itch.io") ||
      origin.includes("html.itch.zone")
    ) {
      callback(true);
    } else {
      callback(false, 403, "Unauthorized Origin");
    }
  },
  perMessageDeflate: {
    zlibDeflateOptions: {
      level: 3,
      chunkSize: 1024,
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024,
    },
    threshold: 1024, 
    serverNoContextTakeover: true,
    clientNoContextTakeover: true,
  },
  maxPayload: 1024 * 1024, // 1 MB
});

let last = Date.now();
let reset = true;
;
const first = createRoom(rooms);
queueRoomId = first.id;

export type TrackedStat = 'tilesCaptured' | 'playersEliminated' | 'goldSpent' | 'armySpent' | 'placement' | 'survivalTimeSeconds';
export function updatePlayerStat(playerId: PlayerId, stat: TrackedStat, amount: number) {
  if (!playerId || playerId.startsWith("bot")) return;

  const roomId = playerRoom.get(playerId);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room || room.privateSettings !== null) return;

  const stats = room.matchStats.get(playerId);
  if (!stats) return;
  
  if (stat === "survivalTimeSeconds") {
    stats.survivalTimeSeconds = Math.floor((amount - room.matchStartAt!) / 1000);
  } else if (stat === "placement") {
    stats.placement = amount;
  } else {
    stats[stat] += amount;
  }
}

export function sendPlayerLog(playerId: string, text: string, color: string = "#ffffff") {
  const socket = sockets.get(playerId);
  if (socket && socket.readyState === 1) {
    socket.send(JSON.stringify({
      type: "LOG",
      text,
      color
    }));
  }
}

export function broadcastRoomLog(room: GameRoom, text: string, color: string = "#ffffff") {
  const msg = JSON.stringify({ type: "LOG", text, color });
  
  room.playerIds.forEach(id => {
    const socket = sockets.get(id);
    if (socket && socket.readyState === 1) {
      socket.send(msg);
    }
  });
}

function getQueueRoom(): GameRoom {
  let room = rooms.get(queueRoomId);
  if (!room) {
    room = createRoom(rooms);
    queueRoomId = room.id;
  }
  return room;
}

function queuedCount(room: GameRoom) {
  return [...room.state.players.values()].filter(p => p.status === "QUEUED").length;
}

function buildLobbyMessage(room: GameRoom) {
  const connected = queuedCount(room);
  const matchStartAt = connected > 0 ? getQueueAutofillDeadline(room.id) : null;

  return {
    type: "LOBBY",
    connected,
    required: room.maxPlayers,
    roomId: room.id,
    matchStartAt,
    serverTime: Date.now(),
  } satisfies ServerMsg;
}

export function broadcastLobby(pid: PlayerId | null = null) {
  const room = getQueueRoom();
  const msg = JSON.stringify(buildLobbyMessage(room));

  // If a specific player ID is provided, send only to that player; otherwise, broadcast to all connected sockets
  if (pid && sockets.has(pid)) {
    const ws = sockets.get(pid);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(msg);
    }
  } else {
    for (const ws of sockets.values()) {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    }
  }
}

function handleJoinQueue(playerId: PlayerId, username: string) {
  if (playerRoom.has(playerId)) return;

  const effectiveUsername = resolveJoinUsername(playerId, username);

  const room = getQueueRoom();
  const color = getNextAvailablePlayerColor(room);

  setPlayer(room.state, {
    id: playerId,
    username: effectiveUsername,
    color,
    status: "QUEUED",
    gold: STARTING_GOLD,
    army: STARTING_ARMY,
    eliminated: false,
    hqPos: { q: 0, r: 0 },
    lastSeen: Date.now(),
    buildings: { fort: 0, barracks: 0, house: 0, laboratory: 0, siege_outpost: 0, harbor: 0 },
    effects: []
  });

  room.playerIds.add(playerId);
  playerRoom.set(playerId, room.id);

  const session = authSessions.get(playerId); 
  room.matchStats.set(playerId, {
    dbId: session ? session.dbId : `guest-${playerId}`,
    tilesCaptured: 0,
    playersEliminated: 0,
    goldSpent: 0,
    armySpent: 0,
    survivalTimeSeconds: 0,
    placement: 0
  });

  handleQueueBots(room, playerRoom);
  broadcastLobby();
  startMatchIfReady(room);
}

function handlePlayerLeaveRoom(playerId: PlayerId) {
  const roomId = playerRoom.get(playerId);
  if (!roomId) return false;

  const room = rooms.get(roomId);
  if (!room || room.privateSettings || room.state.started) return false;

  const player = room.state.players.get(playerId);
  if (!player || player.status !== "QUEUED") return false;

  room.playerIds.delete(playerId);
  room.state.players.delete(playerId);
  room.matchStats.delete(playerId);
  playerRoom.delete(playerId);

  if (![...room.state.players.values()].some((p) => p.status === "QUEUED")) {
    cancelQueueBots(room.id);
  }

  broadcastLobby();
  return true;
}

function handleReturnToLobby(pid: PlayerId) {
  const roomid = playerRoom.get(pid);
  if (!roomid) return;

  const room = rooms.get(roomid);
  if (!room) return;

  const state = room.state;
  let player = state.players.get(pid);
  if (!player) return;

  room.playerIds.delete(pid);
  playerRoom.delete(pid);

  handlePlayerDeath(state, pid);
  room.state.players.delete(pid);

  player.status = "LOBBY";

  broadcastRoomState(room);
  broadcastLobby(pid);
  checkGameOver(state);
}

function broadcastRoom(room: GameRoom, msg: ServerMsg) {
  const data = JSON.stringify(msg);
  for (const pid of room.playerIds) {
    const ws = sockets.get(pid);
    if (ws && ws.readyState === ws.OPEN) ws.send(data);
  }
}

function broadcastRoomState(room: GameRoom, forceFull = false) {
  const nextState = serializeState(room.state);
  const now = Date.now();

  if (forceFull || !room.lastSerializedState) {
    room.lastSerializedState = nextState;
    broadcastRoom(room, { type: "STATE", full: true, state: nextState, serverTime: now });
    return;
  }

  const delta = createWireStateDelta(room.lastSerializedState, nextState);
  if (!delta) {
    room.lastSerializedState = nextState;
    return;
  }

  const fullMsg = JSON.stringify({ type: "STATE", full: true, state: nextState, serverTime: now });
  const deltaMsg = JSON.stringify({ type: "STATE", full: false, delta, serverTime: now });

  room.lastSerializedState = nextState;

  if (deltaMsg.length >= fullMsg.length) {
    broadcastRoom(room, { type: "STATE", full: true, state: nextState, serverTime: now });
    return;
  }

  broadcastRoom(room, { type: "STATE", full: false, delta, serverTime: now });
}

function destroyRoomSoon(roomId: RoomId) {
  const room = rooms.get(roomId);
  if (!room || room.closing) return;
  room.closing = true;

  const savePromises = [];

  if (room.privateSettings === null) { // Only save stats for public matches
    for (const [playerId, stats] of room.matchStats.entries()) {
      if (playerId.startsWith("bot")) continue; 
      if (!stats.dbId || stats.dbId.startsWith("guest-")) continue;

      const isWin = stats.placement === 1;
      const coinsEarned = isWin ? COINS_REWARD_WIN : COINS_REWARD_LOSS;
      const aliveEnoughForCoins = stats.survivalTimeSeconds >= MINIMUM_SURVIVAL_TIME_FOR_COINS ? coinsEarned : 0;

      const session = authSessions.get(playerId);
      if (session) {
        session.coins += aliveEnoughForCoins;
        sendCoinsUpdate(playerId, session.coins);
      }

      const coinsSavedByThisMatch = session?.coins;

      const dbSave = supabase.rpc('process_match_results', {
        p_player_id: stats.dbId, 
        p_coins_earned: aliveEnoughForCoins,
        p_is_win: isWin,
        p_tiles_captured: stats.tilesCaptured,
        p_players_eliminated: stats.playersEliminated,
        p_gold_spent: stats.goldSpent,
        p_army_spent: stats.armySpent,
        p_survival_time: stats.survivalTimeSeconds
      }).then(({ error }) => {
        if (error) {
          console.error(`[SUPABASE ERROR] Failed to save stats for ${stats.dbId}:`, error.message);
          return;
        }
        // Coins were already persisted by this RPC call, avoid a redundant overwrite on disconnect/logout/periodic sync.
        if (session && coinsSavedByThisMatch !== undefined) {
          session.lastSavedCoins = coinsSavedByThisMatch;
        }
      });

      savePromises.push(dbSave);
    }
  }

  Promise.all(savePromises).then(() => {
    setTimeout(() => {
      const r = rooms.get(roomId);
      if (!r) return;
      for (const pid of r.playerIds) {
        playerRoom.delete(pid);
      }
      if (r.privateSettings?.code) {
        privateRoomCodes.delete(r.privateSettings.code);
      }
      rooms.delete(roomId);
      broadcastLobby();
    }, 1000);
  });
}

export function startMatchIfReady(room: GameRoom) {
  if (room.state.started) return;

  const queued = [...room.state.players.values()].filter(p => p.status === "QUEUED");
  if (queued.length < room.maxPlayers) return;

  // Move queued -> playing
  for (const p of queued) p.status = "PLAYING";

  const map = MAPS.get(room.mapId);
  if (!map) {
    throw new Error(`Map not found at match start: ${room.mapId}`);
  }

  // Init map
  initMap(room.state, map);
  // Cache water connectivity graph once per match for fast naval checks.
  room.state.waterNetwork = buildWaterNetwork(room.state);

  startHQPlacementCountdown(room.state, room.id)
  room.lastTickMs = Date.now();

  broadcastRoomState(room);
  room.matchStartAt = Date.now();

  if (room.privateSettings) {
    return;
  }

  // mmediately create a new queue room (fresh lobby target)
  const newRoom = createRoom(rooms);
  queueRoomId = newRoom.id;

  broadcastLobby();
}

let tickCount = 0;
let totalTickTimeMs = 0;
let lastMetricsLog = Date.now();


let bot_tick = 8;

// SERVER TICK LOOP
setInterval(() => {
  const now = Date.now();
  bot_tick = (bot_tick + 1) % 9;
  
  let currentRoomCount = rooms.size;
  let currentRealPlayerCount = sockets.size;
  let currentPlayerCount = playerRoom.size;

  for (const room of rooms.values()) {
    if (!room.state.started) continue;
    if (room.closing) continue;

    // Game over handling
    if (room.state.gameOver) {
      broadcastRoomState(room);
      destroyRoomSoon(room.id);
      continue;
    }

    const dt = (now - room.lastTickMs) / 1000;
    room.lastTickMs = now;
    if (bot_tick == 0)
      runBots(room);
    tick(room.state, dt);
    checkGameOver(room.state);
    broadcastRoomState(room);
  }

  const tickDuration = Date.now() - now;
  totalTickTimeMs += tickDuration;
  tickCount++;

  // log every 60 seconds
  if (now - lastMetricsLog >= 60000) {
    const avgTickTime = tickCount > 0 ? (totalTickTimeMs / tickCount).toFixed(2) : "0.00";
    
    console.log(`[METRICS] --- ${new Date().toISOString()} | Active Rooms:  ${currentRoomCount} | Total Players: ${currentRealPlayerCount} | Players in Rooms: ${currentPlayerCount} | Avg Tick Time: ${avgTickTime}ms (over ${tickCount} ticks) ---`);
    // Reset metrics for the next minute
    tickCount = 0;
    totalTickTimeMs = 0;
    lastMetricsLog = now;
  }

}, TICK_RATE);
 

wss.on("connection", (ws, req) => {
  const playerId = crypto.randomUUID();
  sockets.set(playerId, ws);
  socketLifetime.set(playerId, Date.now());
  console.log(`[CONNECT] Player ${playerId} connected. Total active players: ${sockets.size}`);
  const room = getQueueRoom()
  ws.send(JSON.stringify({ type: "WELCOME", playerId, requiredPlayers: room.maxPlayers, roomId: room.id } satisfies ServerMsg));
  ws.send(JSON.stringify(buildLobbyMessage(room)));

  ws.on("message", async (buf) => {
    let msg: ClientMsg | null = null;
    try { msg = JSON.parse(buf.toString()); } catch { console.log("error while json parsing");return; }
    if (!msg) return;

    if (msg.type === "PING") {
      ws.send(JSON.stringify({ type: "PONG", t: msg.t, serverTime: Date.now() } satisfies ServerMsg));
      return;
    }

    const isReturnToLobbyIntent =
      msg.type === "INTENT" &&
      !!msg.intent &&
      typeof msg.intent === "object" &&
      msg.intent.type === "RETURN_LOBBY";

    if (!isReturnToLobbyIntent) {
      const now = Date.now();
      let history = intentHistory.get(playerId) || [];
      // Filter out timestamps older than 1 second
      history = history.filter(time => now - time < 1000);

      if (history.length >= MAX_INTENTS_PER_SECOND) {
        // ws.send(JSON.stringify({ type: "ERROR", msg: "Too many actions!" }));
        return;
      }
      history.push(now);
      intentHistory.set(playerId, history);
    }

    // GOOGLE AUTH PROCESSING
    if (msg.type === "AUTH") {
      try {
        // Cryptographically decode and verify the JWT via Supabase Auth
        const { data: { user }, error: authError } = await supabase.auth.getUser(msg.token);
        if (authError || !user) throw new Error("Invalid Auth Token");

        const googleUID = user.id;

        // Fetch their permanent profile row
        let { data: dbPlayer, error: dbError } = await supabase
          .from('players')
          .select('id, coins, username')
          .eq('id', googleUID)
          .single();

        if (dbError || !dbPlayer) {
          throw new Error("Missing player profile");
        }

        const profileUsername = typeof dbPlayer.username === "string" && dbPlayer.username.trim().length > 0
          ? dbPlayer.username.trim()
          : "Player";
        const profileCoins = dbPlayer.coins || 0;

        authSessions.set(playerId, {
          dbId: googleUID,
          coins: profileCoins,
          lastSavedCoins: profileCoins,
          username: profileUsername,
        });

        // if player joined room before auth was done
        const rid = playerRoom.get(playerId);
        if (rid) {
          const room = rooms.get(rid);
          const stats = room?.matchStats.get(playerId);
          if (stats && stats.dbId.startsWith("guest-")) {
            stats.dbId = googleUID;
          }
        }

        applyTrackedUsernameToActiveRoom(playerId, profileUsername);
        
        ws.send(JSON.stringify({ type: "AUTH_SUCCESS", username: profileUsername, coins: profileCoins }));
      } catch (err) {
        ws.send(JSON.stringify({ type: "AUTH_FAILURE", reason: "Authentication failed." }));
      }
      return;
    }

    // INTENT PROCESSING
    if (msg.type !== "INTENT" || !msg.intent) return;
    const intent = msg.intent;

    if (intent.type === "JOIN_QUEUE") {
      if (intent.username && intent.username.length > 15) {
        intent.username = intent.username.substring(0, 15);
      }
      handleJoinQueue(playerId, intent.username);
      return;
    }

    if (intent.type === "CHANGE_USERNAME") {
      const socket = sockets.get(playerId);
      if (!socket || socket.readyState !== socket.OPEN) return;

      const session = authSessions.get(playerId);
      if (!session) {
        socket.send(JSON.stringify({ type: "USERNAME_CHANGE_RESULT", success: false, reason: "NOT_AUTHED" }));
        return;
      }

      const requested = typeof intent.username === "string" ? intent.username.trim() : "";
      if (requested.length < 1 || requested.length > 15) {
        socket.send(JSON.stringify({ type: "USERNAME_CHANGE_RESULT", success: false, reason: "INVALID_USERNAME" }));
        return;
      }

      if (requested === session.username) {
        socket.send(JSON.stringify({ type: "USERNAME_CHANGE_RESULT", success: true, username: session.username }));
        return;
      }

      const { data, error } = await supabase
        .from("players")
        .update({ username: requested })
        .eq("id", session.dbId)
        .select("username")
        .single();

      if (error) {
        const reason = error.code === "23505" ? "USERNAME_TAKEN" : "UPDATE_FAILED";
        socket.send(JSON.stringify({ type: "USERNAME_CHANGE_RESULT", success: false, reason }));
        return;
      }

      const updatedUsername = typeof data?.username === "string" && data.username.trim().length > 0
        ? data.username.trim()
        : requested;

      authSessions.set(playerId, {
        ...session,
        username: updatedUsername,
      });

      applyTrackedUsernameToActiveRoom(playerId, updatedUsername);
      socket.send(JSON.stringify({ type: "USERNAME_CHANGE_RESULT", success: true, username: updatedUsername }));
      return;
    }

    if (intent.type === "LOGOUT") {
      const session = authSessions.get(playerId);
      if (session) {
        persistPlayerCoins(session).catch(() => {});
      }
      authSessions.delete(playerId);
      return;
    }

    if (intent.type === "RETURN_LOBBY") {
      handleReturnToLobby(playerId)
      return;
    }

    if (intent.type === "LEAVE_QUEUE") {
      handlePlayerLeaveRoom(playerId);
      return;
    }

    if (intent.type === "SUICIDE") {
      const rid = playerRoom.get(playerId);
      if (!rid) return;

      const room = rooms.get(rid);
      if (!room || !room.state.started) return;

      const player = room.state.players.get(playerId);
      if (!player || player.status !== "PLAYING" || player.eliminated) return;

      handlePlayerDeath(room.state, playerId);
      broadcastRoomState(room);
      return;
    }

    if (intent.type === "CREATE_PRIVATE_ROOM") {
      if (intent.username && intent.username.length > 15) {
        intent.username = intent.username.substring(0, 15);
      }
      const mapId = typeof intent.mapId === "string"
        ? intent.mapId.trim().toLowerCase()
        : undefined;
      try {
        createAndHostPrivateRoom(
          rooms,
          playerId,
          intent.username,
          {
            fillWithBots: intent.fillWithBots ?? false,
            maxPlayers: intent.maxPlayers ?? 4,
            mapId,
          }
        );
      } catch (error) {
        const ws = sockets.get(playerId);
        if (ws && ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: "PRIVATE_ROOM_ERROR", reason: "CREATE_ROOM_FAILED" }));
        }
      }
      return;
    }

    if (intent.type === "JOIN_PRIVATE_ROOM") {
      if (intent.username && intent.username.length > 15) {
        intent.username = intent.username.substring(0, 15);
      }
      const result = handleJoinPrivateRoom(playerId, intent.username, intent.code);
      if (!result.success) {
        const ws = sockets.get(playerId);
        if (ws && ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: "PRIVATE_ROOM_ERROR", reason: result.reason }));
        }
      }
      return;
    }

    if (intent.type === "START_PRIVATE_MATCH") {
      const rid = playerRoom.get(playerId);
      if (!rid) return;
      const result = startPrivateMatchManually(rid, playerId);
      if (!result.success) {
        const ws = sockets.get(playerId);
        if (ws && ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: "PRIVATE_ROOM_ERROR", reason: result.reason }));
        }
      }
      return;
    }

    if (intent.type === "LEAVE_PRIVATE_ROOM") {
      handlePlayerLeavePrivateRoom(playerId);
      return;
    }

    // Gameplay intents only if player is in a room
    const rid = playerRoom.get(playerId);
    if (!rid) return;

    const room = rooms.get(rid);
    if (!room) return;

    const intentResult = applyIntent(room.state, playerId, intent);

    // Special attack broadcast
    if (intentResult?.specialAttack) {
      const prepared = intentResult.specialAttack;

      broadcastRoom(room, {
        type: "SPECIAL_ATTACK_LAUNCHED",
        attackType: prepared.attackType,
        casterId: prepared.casterId,
        sourceQ: prepared.sourceQ,
        sourceR: prepared.sourceR,
        targetQ: prepared.targetQ,
        targetR: prepared.targetR,
        travelMs: prepared.travelMs,
        serverTime: Date.now(),
      });

      setTimeout(() => {
        const liveRoom = rooms.get(rid);
        if (!liveRoom || liveRoom.closing || !liveRoom.state.started || !!liveRoom.state.gameOver) return;
        executePreparedSpecialAttack(liveRoom.state, prepared);
      }, prepared.travelMs);
    }
  });

  ws.on("close", () => {
    console.log(`[DISCONNECT] Player ${playerId} disconnected. Active time: ${(Date.now() - (socketLifetime.get(playerId) || Date.now())) / 1000}s`);
    socketLifetime.delete(playerId);
    sockets.delete(playerId);
    intentHistory.delete(playerId);

    const authSession = authSessions.get(playerId);
    if (authSession) {
      persistPlayerCoins(authSession).catch(() => {});
    }
    authSessions.delete(playerId);

    const rid = playerRoom.get(playerId);
    if (!rid) 
      return;

    const room = rooms.get(rid);
    if (!room) {
      playerRoom.delete(playerId);
      if (rid === queueRoomId)
        broadcastLobby();
      return;
    }

    // Handle disconnect if in a private room lobby that hasn't started yet
    if (room.privateSettings && !room.state.started) {
      handlePlayerLeavePrivateRoom(playerId);
      return;
    }

    const player = room.state.players.get(playerId);

    if (!room.state.started && player?.status === "QUEUED") {
      handlePlayerLeaveRoom(playerId);
      return;
    }

    if (player?.status === "PLAYING") {
      handlePlayerDeath(room.state, playerId);
    }

    // Remove player bookkeeping
    room.playerIds.delete(playerId);
    room.state.players.delete(playerId);
    playerRoom.delete(playerId);

    // Update lobby if needed
    if (rid === queueRoomId) broadcastLobby();

    // Cleanup empty running games when all human players are gone
    if (room.state.started) {
      const remainingHumans = [...room.state.players.values()].filter(p => !p.isBot);
      if (remainingHumans.length === 0) {
        // Destroy room after a short delay to ensure state is clean
        destroyRoomSoon(rid);
      }
    }
  });

});

console.log(`Server running on ws://localhost:${PORT}`);


export function handleJoinPrivateRoom(playerId: PlayerId, username: string, code: string) {
  if (playerRoom.has(playerId)) {
    return { success: false, reason: "ALREADY_IN_ROOM" };
  }

  const cleanCode = code.toUpperCase().trim();
  const roomId = privateRoomCodes.get(cleanCode);
  if (!roomId) {
    return { success: false, reason: "ROOM_NOT_FOUND" };
  }

  const room = rooms.get(roomId);

  if (!room || room.closing) {
    privateRoomCodes.delete(cleanCode);
    return { success: false, reason: "ROOM_NOT_FOUND" };
  }

  if (room.playerIds.size >= room.maxPlayers) {
    return { success: false, reason: "ROOM_FULL" };
  }

  if (room.state.started) {
    return { success: false, reason: "GAME_ALREADY_STARTED" };
  }

  const color = getNextAvailablePlayerColor(room);
  const effectiveUsername = resolveJoinUsername(playerId, username);

  setPlayer(room.state, {
    id: playerId,
    username: effectiveUsername,
    color,
    status: "QUEUED",
    gold: STARTING_GOLD,
    army: STARTING_ARMY,
    eliminated: false,
    hqPos: { q: 0, r: 0 },
    lastSeen: Date.now(),
    buildings: { fort: 0, barracks: 0, house: 0, laboratory: 0, siege_outpost: 0, harbor: 0 },
    effects: []
  });

  room.playerIds.add(playerId);
  playerRoom.set(playerId, room.id);

  const session = authSessions.get(playerId);
  room.matchStats.set(playerId, {
    dbId: session ? session.dbId : `guest-${playerId}`,
    tilesCaptured: 0,
    playersEliminated: 0,
    goldSpent: 0,
    armySpent: 0,
    survivalTimeSeconds: 0,
    placement: 0
  });

  broadcastPrivateRoomLobby(room);

  return { success: true, room };
}

export function startPrivateMatchManually(roomId: RoomId, requestingPlayerId: PlayerId): { success: true } | { success: false; reason: string } {
  const room = rooms.get(roomId);
  if (!room || !room.privateSettings || room.state.started || room.closing) {
    return { success: false, reason: "INVALID_ROOM_STATE" };
  }

  if (room.privateSettings.hostId !== requestingPlayerId) {
    return { success: false, reason: "NOT_HOST" };
  }

  // Fill empty slots with bots if configured
  if (room.privateSettings.fillWithBots && room.state.players.size < room.maxPlayers) {
    fillRoomWithBots(room, playerRoom, {
      startWhenFull: false,
      broadcastPublicLobby: false,
    });
  }

  // Forces match start even if room is not completely full
  startPrivateMatch(room);
  return { success: true };
}

function startPrivateMatch(room: GameRoom) {
  if (room.state.started) return;

  const queued = [...room.state.players.values()].filter(p => p.status === "QUEUED");

  for (const p of queued) p.status = "PLAYING";

  const map = MAPS.get(room.mapId);
  if (!map) {
    throw new Error(`Map not found at match start: ${room.mapId}`);
  }

  initMap(room.state, map);
  room.state.waterNetwork = buildWaterNetwork(room.state);
  startHQPlacementCountdown(room.state, room.id);
  room.lastTickMs = Date.now();
  room.matchStartAt = Date.now();

  broadcastRoomState(room);
}

export function handlePlayerLeavePrivateRoom(playerId: PlayerId) {
  const roomId = playerRoom.get(playerId);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room || !room.privateSettings) return;

  const wasHost = playerId === room.privateSettings.hostId;

  // Remove player from state and trackers
  if (room.state.started) {
    handlePlayerDeath(room.state, playerId);
  }
  room.state.players.delete(playerId);
  room.playerIds.delete(playerId);
  room.matchStats.delete(playerId);
  playerRoom.delete(playerId);

  // Check if any real humans are left
  const remainingHumans = [...room.state.players.values()].filter(p => !p.isBot);

  if (remainingHumans.length === 0) {
    // Delete code mapping and purge room immediately
    if (room.privateSettings.code) {
      privateRoomCodes.delete(room.privateSettings.code);
    }
    rooms.delete(roomId);
    console.log(`[PRIVATE LOBBY] Room ${roomId} destroyed because no human players remained.`);
  } else {
    // Transfer host if the current host left
    if (wasHost && remainingHumans.length > 0) {
      const newHost = remainingHumans[0];
      room.privateSettings.hostId = newHost.id;
      console.log(`[PRIVATE LOBBY] Host transferred to ${newHost.username} in room ${roomId}`);
    }
    
    // Notify remaining players in the lobby (they'll see new host status)
    broadcastPrivateRoomLobby(room);
  }
}

export function createAndHostPrivateRoom(
  rooms: Map<RoomId, GameRoom>,
  hostPlayerId: PlayerId,
  username: string,
  options?: { fillWithBots?: boolean; maxPlayers?: number; mapId?: string }
) {
  if (playerRoom.has(hostPlayerId)) {
    throw new Error("PLAYER_ALREADY_IN_ROOM");
  }

  const room = createPrivateRoom(rooms, options);

  // Set the host ID
  if (room.privateSettings) {
    room.privateSettings.hostId = hostPlayerId;
  }

  const color = getNextAvailablePlayerColor(room);
  const effectiveUsername = resolveJoinUsername(hostPlayerId, username);

  setPlayer(room.state, {
    id: hostPlayerId,
    username: effectiveUsername,
    color,
    status: "QUEUED",
    gold: STARTING_GOLD,
    army: STARTING_ARMY,
    eliminated: false,
    hqPos: { q: 0, r: 0 },
    lastSeen: Date.now(),
    buildings: { fort: 0, barracks: 0, house: 0, laboratory: 0, siege_outpost: 0, harbor: 0 },
    effects: []
  });

  // 4. Register host in player tracking sets & maps
  room.playerIds.add(hostPlayerId);
  playerRoom.set(hostPlayerId, room.id);

  broadcastPrivateRoomLobby(room);
}

export function broadcastPrivateRoomLobby(room: GameRoom) {
  if (!room.privateSettings) return;

  // 1. Map player IDs to clean display data
  const playersList = Array.from(room.playerIds).map((pid) => {
    const player = room.state.players.get(pid);
    return {
      username: player?.username ?? "Unknown",
    };
  });

  // 2. Send individual payloads to each player with their isHost status
  for (const pid of room.playerIds) {
    if (pid.startsWith("bot")) continue; // Skip bot IDs
    const ws = sockets.get(pid);
    if (ws && ws.readyState === ws.OPEN) {
      const payload = JSON.stringify({
        type: "PRIVATE_LOBBY",
        roomId: room.id,
        connected: queuedCount(room),
        required: room.maxPlayers,
        code: room.privateSettings.code,
        mapId: room.privateSettings.mapId,
        fillWithBots: room.privateSettings.fillWithBots,
        players: playersList,
        isHost: pid === room.privateSettings.hostId
      });
      ws.send(payload);
    }
  }
}