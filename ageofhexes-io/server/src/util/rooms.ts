import { CoreGameState, MAPS } from "../../../system/index.js";
import { MIN_PRIVATE_ROOM_PLAYERS, MAX_PRIVATE_ROOM_PLAYERS, ROOM_CODE_LENGTH } from "../../../shared/constants.js";
import { PlayerId, WireState } from "../../../shared/index.js";
import crypto from "node:crypto";
import { createGameState, setPlayer } from "../../../system/index.js";
import { PlayerMatchStats } from "../../../shared/gameTypes.js";

export type RoomId = string;
export const privateRoomCodes = new Map<string, RoomId>();
const ALPHANUM = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export interface RoomSettings {
  code: string;           
  fillWithBots: boolean;
  maxPlayers: number;
  mapId: string;
  hostId: PlayerId;
}

export type GameRoom = {
  id: RoomId;
  state: CoreGameState;
  lastBroadcastHash: number;
  lastSerializedState: WireState | null;
  playerIds: Set<PlayerId>;  
  lastTickMs: number;
  createdAt: number;
  matchStartAt: number | null;  // timestamp when the match started
  closing: boolean;           // to avoid double-destroy
  mapId: string;
  maxPlayers: number;
  matchStats: Map<PlayerId, PlayerMatchStats>;
  privateSettings: RoomSettings | null;
};

type WeightedMap = {
  id: string;
  weight: number;
};

// default: every map has weight = 1
const MAP_POOL: WeightedMap[] =
  Array.from(MAPS.keys()).map((id): WeightedMap => ({
    id: id as string,
    weight: 1,
  }));


// override weights
const EXTRA_WEIGHTS: Record<string, number> = {
  logomap: 0,
};

for (const m of MAP_POOL) {
  if (EXTRA_WEIGHTS[m.id] !== undefined) {
    m.weight = EXTRA_WEIGHTS[m.id];
  }
}

let lastMapId: string | null = null;

function pickWeightedMapId(): string {
  if (MAP_POOL.length === 0) {
    throw new Error("MAP_POOL is empty");
  }

  const totalWeight = MAP_POOL.reduce((sum, m) => sum + m.weight, 0);
  let r = Math.random() * totalWeight;

  for (const m of MAP_POOL) {
    if (r < m.weight) {
      // prevent same map twice in a row
      /*
      if (m.id === lastMapId && MAP_POOL.length > 1) {
        return pickWeightedMapId();
      }
        */

      lastMapId = m.id;
      return m.id;
    }
    r -= m.weight;
  }

  return MAP_POOL[0].id;
}


export function createRoom(rooms: Map<RoomId, GameRoom>): GameRoom {
  const id = crypto.randomUUID();

  const mapId = pickWeightedMapId();
  const map = MAPS.get(mapId);

  if (!map) {
    throw new Error(`Map not found: ${mapId}`);
  }

  const room: GameRoom = {
    id,
    state: createGameState(),
    lastBroadcastHash: 0,
    lastSerializedState: null,
    playerIds: new Set(),
    lastTickMs: Date.now(),
    createdAt: Date.now(),
    matchStartAt: null,
    closing: false,
    mapId,
    maxPlayers: map.playerCount,
    matchStats: new Map(),
    privateSettings: null,
  };

  rooms.set(id, room);
  return room;
}


function generateRoomCode(length = ROOM_CODE_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHANUM.charAt(Math.floor(Math.random() * ALPHANUM.length));
  }
  // Ensure uniqueness across active private rooms
  if (privateRoomCodes.has(code)) {
    return generateRoomCode(length);
  }
  return code;
}


export function createPrivateRoom(
  rooms: Map<RoomId, GameRoom>,
  options?: { fillWithBots?: boolean; maxPlayers?: number; mapId?: string }
): GameRoom {
  const roomCode = generateRoomCode();
  const id = crypto.randomUUID();

  const requestedMapId = options?.mapId;
  if (requestedMapId && !MAPS.has(requestedMapId)) {
    throw new Error("Invalid mapId value");
  }

  const mapId = requestedMapId ?? pickWeightedMapId();
  const map = MAPS.get(mapId);

  if (!map) {
    throw new Error(`Map not found: ${mapId}`);
  }

  if (options?.maxPlayers && (options.maxPlayers < MIN_PRIVATE_ROOM_PLAYERS || options.maxPlayers > MAX_PRIVATE_ROOM_PLAYERS)) {
    throw new Error("Invalid maxPlayers value");
  }

  const room: GameRoom = {
    id,
    state: createGameState(),
    lastBroadcastHash: 0,
    lastSerializedState: null,
    playerIds: new Set(),
    lastTickMs: Date.now(),
    createdAt: Date.now(),
    matchStartAt: null,
    closing: false,
    mapId,
    maxPlayers: options?.maxPlayers ?? 4,
    matchStats: new Map(),
    privateSettings: {
      code: roomCode,
      fillWithBots: options?.fillWithBots ?? false,
      maxPlayers: options?.maxPlayers ?? 4,
      mapId,
      hostId: "",  // gets set later
    },
  };

  rooms.set(id, room);
  privateRoomCodes.set(roomCode, id);
  return room;
}