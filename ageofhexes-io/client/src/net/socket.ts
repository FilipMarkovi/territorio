// net.ts
import {
  applyWireStateDelta,
  deserializeState,
  type WireState,
  type WireStateDelta,
  type PlayerMatchStats
} from "../../../shared/index.js";
import { clientNetState } from "../state/clientState.js";

export type PrivateLobbyMsg = {
  type: "PRIVATE_LOBBY";
  roomId: string;
  code: string;
  connected: number;
  required: number;
  mapId: string;
  fillWithBots: boolean;
  players: Array<{ username: string }>;
  isHost?: boolean;
};

export type PrivateErrorMsg = {
  type: "PRIVATE_ROOM_ERROR";
  reason: string;
};

export type UsernameChangeResultMsg = {
  type: "USERNAME_CHANGE_RESULT";
  success: boolean;
  username?: string;
  reason?: string;
};

export type SpecialAttackLaunchedMsg = {
  type: "SPECIAL_ATTACK_LAUNCHED";
  attackType: string;
  casterId: string;
  sourceQ: number;
  sourceR: number;
  targetQ: number;
  targetR: number;
  travelMs: number;
  serverTime?: number;
};

export type SkinPurchaseResultMsg =
  | { type: "SKIN_PURCHASE_RESULT"; success: true; skinId: string; coins: number }
  | { type: "SKIN_PURCHASE_RESULT"; success: false; reason: string };

export type ServerMsg =
  | { type: "WELCOME"; playerId: string; requiredPlayers: number; roomId: string }
  | { type: "LOBBY"; connected: number; required: number; roomId: string; matchStartAt: number | null; serverTime: number }
  | { type: "STATE"; full: true; state: WireState; serverTime?: number }
  | { type: "STATE"; full: false; delta: WireStateDelta; serverTime?: number }
  | { type: "LOG"; text: string; color?: string }
  | { type: "AUTH_SUCCESS"; username?: string; coins?: number; ownedSkins?: string[] }
  | { type: "AUTH_FAILURE"; reason?: string }
  | { type: "COINS_UPDATE"; coins: number }
  | { type: "PONG"; t: number; serverTime: number }
  | { type: "POST_MATCH_RESULTS"; stats: PlayerMatchStats }
  | SpecialAttackLaunchedMsg
  | SkinPurchaseResultMsg
  | PrivateLobbyMsg
  | PrivateErrorMsg
  | UsernameChangeResultMsg;

type ClientMsg =
  | { type: "INTENT"; intent: any }
  | { type: "AUTH"; token: string }
  | { type: "PING"; t: number };

const PING_INTERVAL_MS = 3000;
const HEALTH_CHECK_INTERVAL_MS = 3000;

export function connect(url: string, handlers: {
  onWelcome: (playerId: string, requiredPlayers: number, roomId: string) => void;
  onLobby: (connected: number, required: number, roomId: string, matchStartAt: number | null) => void;
  onState: (state: any) => void;
  onLog: (text: string, color?: string) => void;
  onAuthSuccess?: (username?: string, coins?: number, ownedSkins?: string[]) => void;
  onAuthFailure?: (reason?: string) => void;
  onCoinsUpdate?: (coins: number) => void;
  onPrivateLobby?: (msg: PrivateLobbyMsg) => void;
  onPrivateError?: (reason: string) => void;
  onUsernameChangeResult?: (msg: UsernameChangeResultMsg) => void;
  onSpecialAttackLaunched?: (msg: SpecialAttackLaunchedMsg) => void;
  onSkinPurchaseResult?: (msg: SkinPurchaseResultMsg) => void;
  onMatchResults?: (stats: PlayerMatchStats) => void;
  onDisconnected?: () => void;
  onReconnected?: () => void;
}) {
  let ws: WebSocket;
  let latestWireState: WireState | null = null;
  let pingIntervalId: ReturnType<typeof setInterval> | null = null;
  let reconnectAttemptPending = false;
  let hasConnectedOnce = false;

  function sendPing() {
    if (ws.readyState !== ws.OPEN) return;
    const out: ClientMsg = { type: "PING", t: Date.now() };
    ws.send(JSON.stringify(out));
  }

  function reconnect() {
    if (reconnectAttemptPending) return;
    reconnectAttemptPending = true;
    latestWireState = null;
    openSocket();
  }

  function openSocket() {
    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectAttemptPending = false;
      if (hasConnectedOnce) {
        handlers.onReconnected?.();
      }
      hasConnectedOnce = true;
      sendPing();
      pingIntervalId = setInterval(sendPing, PING_INTERVAL_MS);
    };

    ws.onclose = () => {
      if (pingIntervalId !== null) {
        clearInterval(pingIntervalId);
        pingIntervalId = null;
      }
      handlers.onDisconnected?.();
      // Only retry immediately while the tab is active; otherwise the health check will catch it on resume.
      if (!document.hidden) {
        reconnect();
      }
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as ServerMsg;

      switch (msg.type) {
        case "WELCOME":
          handlers.onWelcome(msg.playerId, msg.requiredPlayers, msg.roomId);
          break;
        case "LOBBY":
          clientNetState.serverClockOffset = msg.serverTime - Date.now();
          handlers.onLobby(
            msg.connected,
            msg.required,
            msg.roomId,
            typeof msg.matchStartAt === "number" && Number.isFinite(msg.matchStartAt)
              ? msg.matchStartAt
              : null
          );
          break;
        case "STATE": {
          if (msg.serverTime) {
            clientNetState.serverClockOffset = msg.serverTime - Date.now();
          }
          if (msg.full) {
            latestWireState = msg.state;
          } else if (latestWireState) {
            latestWireState = applyWireStateDelta(latestWireState, msg.delta);
          } else {
            break;
          }

          handlers.onState(deserializeState(latestWireState));
          break;
        }
        case "LOG":
          handlers.onLog(msg.text, msg.color);
          break;
        case "AUTH_SUCCESS":
          handlers.onAuthSuccess?.(msg.username, msg.coins, msg.ownedSkins);
          break;
        case "AUTH_FAILURE":
          handlers.onAuthFailure?.(msg.reason);
          break;
        case "COINS_UPDATE":
          handlers.onCoinsUpdate?.(msg.coins);
          break;
        case "PRIVATE_LOBBY":
          handlers.onPrivateLobby?.(msg);
          break;
        case "PRIVATE_ROOM_ERROR":
          handlers.onPrivateError?.(msg.reason);
          break;
        case "USERNAME_CHANGE_RESULT":
          handlers.onUsernameChangeResult?.(msg);
          break;
        case "SPECIAL_ATTACK_LAUNCHED":
          handlers.onSpecialAttackLaunched?.(msg);
          break;
        case "POST_MATCH_RESULTS":
          handlers.onMatchResults?.(msg.stats);
          break;
        case "SKIN_PURCHASE_RESULT":
          handlers.onSkinPurchaseResult?.(msg);
          break;
        case "PONG":
          clientNetState.serverClockOffset = msg.serverTime - Date.now();
          clientNetState.latencyMs = Date.now() - msg.t;
          break;
      }
    };
  }

  openSocket();

  // Safety net: catches dead sockets that never fire onclose (e.g. silent network drops).
  setInterval(() => {
    if (document.hidden) return;
    if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      reconnect();
    }
  }, HEALTH_CHECK_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING)) {
      reconnect();
    }
  });

  function sendIntent(intent: any) {
    if (ws.readyState !== ws.OPEN) return;
    const out: ClientMsg = { type: "INTENT", intent };
    ws.send(JSON.stringify(out));
  }

  function tryAuth(token: any) {
    if (ws.readyState !== ws.OPEN) return;
    const out: ClientMsg = { type: "AUTH", token: token };
    ws.send(JSON.stringify(out));
  }

  return { sendIntent, tryAuth };
}