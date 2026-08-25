
import type { PlayerId, PlayerState, TileState, GamePhase, WaterNetwork } from "../../shared/index.js";
import { getConnectedTilesFromHQ, handlePlayerDeath, recalcDefense } from "./systems.js";
import { MIN_HQ_DISTANCE } from "../../shared/constants.js";
import { key, DIRS, neighbors, neighborTiles, hexDistance, getHexDistance } from "../../shared/util.js";
import { HQ_PLACEMENT_TIME_LIMIT } from "../index.js";

export interface CoreGameState {
  phase: GamePhase;
  tiles: Map<string, TileState>;
  players: Map<PlayerId, PlayerState>;
  started: boolean;
  gameOver: null | { winner: PlayerId; reason: "ELIMINATION" | "TERRITORY"; };
  connectedCache?: Map<PlayerId, Set<string>> | null;
  waterNetwork?: WaterNetwork | null;
  mapId: null | string;
  mapName: null | string;
  HQLocations: Map<PlayerId, TileState>;
  placementTimeLeft?: number;
  lastPlagueSpreadAt?: number;
} // copy in shared

export function createGameState(): CoreGameState {
  return {
    phase: "HQ_PLACEMENT",
    tiles: new Map(),
    players: new Map(),
    started: false,
    gameOver: null,
    connectedCache: null,
    waterNetwork: null,
    mapId: null,
    mapName: null,
    HQLocations: new Map(),
    placementTimeLeft: 15,
    lastPlagueSpreadAt: Date.now(),
  };
}

export function getTile(state: CoreGameState, q: number, r: number) {
  return state.tiles.get(key(q, r));
}

export function setPlayer(state: CoreGameState, player: PlayerState) {
  state.players.set(player.id, player);
}

export function isAdjacentOwned(state: CoreGameState, q: number, r: number, ownerId: PlayerId): boolean {
  return neighbors(q, r).some(n => {
    const t = getTile(state, n.q, n.r);
    return !!t && t.ownerId === ownerId;
  });
}

export function nonOwnedNeighbors(state: CoreGameState, q: number, r: number, ownerId: PlayerId): any {
  let found = Array()
  neighbors(q, r).some(n => {
    const t = getTile(state, n.q, n.r);
    if (t && t.ownerId != ownerId)
    found.push(n)
  });
  return found;
}

export function isAdjacentOwnedAndConnected(
  state: CoreGameState,
  q: number,
  r: number,
  playerId: PlayerId
): boolean {
  const connected = getConnectedTilesFromHQ(state, playerId);

  return neighbors(q, r).some(n => {
    const t = getTile(state, n.q, n.r);
    if (!t) return false;
    if (t.ownerId !== playerId) return false;
    return connected.has(key(t.q, t.r));
  });
}

export function handlePlaceHQ(
  state: CoreGameState, 
  playerId: PlayerId, 
  q: number, 
  r: number
): { success: boolean; error?: string } {
  
  // 1. Enforce phase restriction
  if (state.phase !== "HQ_PLACEMENT") {
    return { success: false, error: "HQ placement phase has concluded." };
  }

  const tileKey = `${q},${r}`;
  const targetTile = state.tiles.get(tileKey);

  // 2. Base Validation Rules
  if (!targetTile) return { success: false, error: "Tile does not exist." };
  if (targetTile.terrain === "BEDROCK" || targetTile.terrain === "WATER") {
    return { success: false, error: "Cannot establish an HQ on this terrain." };
  }
  
  // If the tile is already owned by someone else
  if (targetTile.ownerId !== null && targetTile.ownerId !== playerId) {
    return { success: false, error: "This tile is already claimed by another player." };
  }

  if(targetTile.building !== null){
    return { success: false, error: "This tile already has a building on it." };
  }

  // 3. PREVENTION: Check proximity to other player HQs
  for (const [otherPlayerId, oldHQLocation] of state.HQLocations.entries()) {
    if (otherPlayerId === playerId) continue; // Skip checking against yourself
    
    // Calculate axial/hex distance between the target tile and existing HQs
    const distance = getHexDistance(q, r, oldHQLocation.q, oldHQLocation.r);
    if (distance < MIN_HQ_DISTANCE) {
      return { success: false, error: `Too close to an enemy HQ! Must be at least ${MIN_HQ_DISTANCE} tiles away.` };
    }
  }

  // 4. REPLACEMENT LOGIC: Clean up old HQ if this player already placed one
  const existingHQ = state.HQLocations.get(playerId);
  if (existingHQ) {
    existingHQ.ownerId = null;
    existingHQ.building = null;
    existingHQ.defense = existingHQ.baseDefense;
  }

  // 5. Apply New HQ State (No auto-capturing surrounding ring!)
  targetTile.ownerId = playerId;
  targetTile.building = "HQ";

  // 6. Register Location in State Caching
  state.HQLocations.set(playerId, targetTile);

  return { success: true };
}

export function startHQPlacementCountdown(state: CoreGameState, roomId: string) {
  state.phase = "HQ_PLACEMENT";
  state.started = true;
  state.placementTimeLeft = Math.floor(HQ_PLACEMENT_TIME_LIMIT / 1000);

  const timerInterval = setInterval(() => {
    if (!state.placementTimeLeft) state.placementTimeLeft = 0;
    state.placementTimeLeft--;

    if (state.placementTimeLeft <= 0) {
      clearInterval(timerInterval);
      endHQPlacementAndEliminate(state, roomId);
    }
  }, 1000);
}

function endHQPlacementAndEliminate(state: CoreGameState, roomId: string) {

  // 1. Identify and eliminate players who failed to place an HQ
  for (const [playerId, player] of state.players.entries()) {
    if (!state.HQLocations.has(playerId)) {
      handlePlayerDeath(state, playerId)
    }
  }

  for (const [playerId, hqTile] of state.HQLocations.entries()) {
    const player = state.players.get(playerId);
    if (player) {
      player.hqPos = { q: hqTile.q, r: hqTile.r }; 
    }
  }

  // 2. Transition Game State Phases
  state.phase = "GAMEPLAY";

  if (state.connectedCache) {
    state.connectedCache = new Map();
  }

  recalcDefense(state)
}

