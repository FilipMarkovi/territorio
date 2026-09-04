// server/ai/queueBotManager.ts

import crypto from "node:crypto";
import type { GameRoom } from "../util/rooms.js";
import {
  setPlayer,
  getRandomNames,
} from "../../../system/index.js";
import { STARTING_GOLD, STARTING_ARMY } from "../../../shared/constants.js";
import { TIME_TO_AI_AUTOFILL } from "../../../system/core/serverConstants.js";
import { broadcastLobby,startMatchIfReady } from "../index.js";
import { start } from "node:repl";
import { getNextAvailablePlayerColor } from "../util/playerColors.js";

const queueTimers = new Map<string, NodeJS.Timeout>();
const queueAutofillDeadlines = new Map<string, number>();

export function getQueueAutofillDeadline(roomId: string): number | null {
  return queueAutofillDeadlines.get(roomId) ?? null;
}

export function cancelQueueBots(roomId: string) {
  const timer = queueTimers.get(roomId);
  if (!timer) return;

  clearTimeout(timer);
  queueTimers.delete(roomId);
  queueAutofillDeadlines.delete(roomId);
}

export function handleQueueBots(
  room: GameRoom,
  playerRoom: Map<string, string>
) {
  const queuedPlayers = [...room.state.players.values()].filter(
    p => p.status === "QUEUED" && !p.isBot
  );

  // If first human joined empty queue
  if (queuedPlayers.length === 1 && room.state.players.size === 1) {
    if (queueTimers.has(room.id)) return;

    const timer = setTimeout(() => {
      fillRoomWithBots(room, playerRoom);
      queueTimers.delete(room.id);
      queueAutofillDeadlines.delete(room.id);
    }, TIME_TO_AI_AUTOFILL);

    queueTimers.set(room.id, timer);
    queueAutofillDeadlines.set(room.id, Date.now() + TIME_TO_AI_AUTOFILL);
  }
}

export function fillRoomWithBots(
  room: GameRoom,
  playerRoom: Map<string, string>,
  options?: {
    startWhenFull?: boolean;
    broadcastPublicLobby?: boolean;
  }
) {
  if(room.state.players.size <= 0) return
  const bot_count = room.maxPlayers - room.state.players.size
  const names = getRandomNames(bot_count)
  let i = 0
  while (room.state.players.size < room.maxPlayers) {
    const botId = `bot_${crypto.randomUUID()}`;
    const color = getNextAvailablePlayerColor(room);

    setPlayer(room.state, {
      id: botId,
      username: names[i],
      color,
      skinId: null,
      status: "QUEUED",
      gold: STARTING_GOLD,
      army: STARTING_ARMY,
      eliminated: false,
      hqPos: { q: 0, r: 0 },
      lastSeen: Date.now(),
      isBot: true,
      buildings: {
        fort: 0,
        barracks: 0,
        house: 0,
        laboratory: 0,
        siege_outpost: 0,
        harbor: 0,
      },
      effects: []
    });
    i++;

    room.playerIds.add(botId);
    playerRoom.set(botId, room.id);
  }

  if (options?.broadcastPublicLobby !== false) {
    broadcastLobby();
  }

  if (options?.startWhenFull !== false) {
    startMatchIfReady(room);
  }
}
