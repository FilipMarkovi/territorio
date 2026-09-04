import type { CoreGameState, TileState, PlayerState } from "./gameTypes.js";

// --- ENUM MAPPINGS (O(1) lookups) ---
const TERRAIN_MAP: Record<string, number> = { GRASS: 0, MOUNTAIN: 1, BEDROCK: 2, DESERT: 3, WATER: 4 };
const TERRAIN_REV = ["GRASS", "MOUNTAIN", "BEDROCK", "DESERT", "WATER"] as const;

const BLD_MAP: Record<string, number> = { HQ: 0, FORT: 1, BARRACKS: 2, HOUSE: 3, LABORATORY: 4, SIEGE_OUTPOST: 5, HARBOR: 6 };
const BLD_REV = ["HQ", "FORT", "BARRACKS", "HOUSE", "LABORATORY", "SIEGE_OUTPOST", "HARBOR"] as const;

const PHASE_MAP: Record<string, number> = { HQ_PLACEMENT: 0, GAMEPLAY: 1 };
const PHASE_REV = ["HQ_PLACEMENT", "GAMEPLAY"] as const;

const STATUS_MAP: Record<string, number> = { LOBBY: 0, QUEUED: 1, PLAYING: 2, ELIMINATED: 3 };
const STATUS_REV = ["LOBBY", "QUEUED", "PLAYING", "ELIMINATED"] as const;

const TILE_EFF_MAP: Record<string, number> = { REINFORCED: 0, BROKEN_GROUND: 1, PLAGUED: 2 };
const TILE_EFF_REV = ["REINFORCED", "BROKEN_GROUND", "PLAGUED"] as const;

const SPECIAL_BLD_MAP: Record<string, number> = { PLAGUE_SOURCE: 0 };
const SPECIAL_BLD_REV = ["PLAGUE_SOURCE"] as const;

const PLY_EFF_MAP: Record<string, number> = { ATTACK_SPEED: 0, ARMY_GAIN_BUFF: 1, HYPERINFLATION: 2 };
const PLY_EFF_REV = ["ATTACK_SPEED", "ARMY_GAIN_BUFF", "HYPERINFLATION"] as const;

// Top level array format:
// [ phase, started, placementTime, gameOver, mapId, mapName, players[], tiles[], hqLocs[] ]
export type WireState = any[]; 

export type WireArrayDelta = [newLength: number, changes: Array<[index: number, value: any]>];

export interface WireStateDelta {
  top: Array<[index: number, value: any]>;
  players?: WireArrayDelta;
  tiles?: WireArrayDelta;
  hqLocs?: WireArrayDelta;
}

function wireValueEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (!wireValueEqual(a[i], b[i])) return false;
  }
  return true;
}

function createIndexedDelta(prev: any[], next: any[]): WireArrayDelta | null {
  const changes: Array<[number, any]> = [];
  const maxLen = Math.max(prev.length, next.length);

  for (let index = 0; index < maxLen; index++) {
    const hasNext = index < next.length;
    if (!hasNext) continue;

    const hasPrev = index < prev.length;
    if (!hasPrev || !wireValueEqual(prev[index], next[index])) {
      changes.push([index, next[index]]);
    }
  }

  if (changes.length === 0 && prev.length === next.length) {
    return null;
  }

  return [next.length, changes];
}

function applyIndexedDelta(base: any[], delta: WireArrayDelta): any[] {
  const [newLength, changes] = delta;
  const next = base.slice(0, newLength);

  for (const [index, value] of changes) {
    next[index] = value;
  }

  return next;
}

export function createWireStateDelta(prev: WireState, next: WireState): WireStateDelta | null {
  const top: Array<[number, any]> = [];

  for (let index = 0; index <= 5; index++) {
    if (!wireValueEqual(prev[index], next[index])) {
      top.push([index, next[index]]);
    }
  }

  const players = createIndexedDelta((prev[6] as any[]) ?? [], (next[6] as any[]) ?? []);
  const tiles = createIndexedDelta((prev[7] as any[]) ?? [], (next[7] as any[]) ?? []);
  const hqLocs = createIndexedDelta((prev[8] as any[]) ?? [], (next[8] as any[]) ?? []);

  if (top.length === 0 && !players && !tiles && !hqLocs) {
    return null;
  }

  const delta: WireStateDelta = { top };
  if (players) delta.players = players;
  if (tiles) delta.tiles = tiles;
  if (hqLocs) delta.hqLocs = hqLocs;

  return delta;
}

export function applyWireStateDelta(base: WireState, delta: WireStateDelta): WireState {
  const next: WireState = base.slice();

  for (const [index, value] of delta.top) {
    next[index] = value;
  }

  if (delta.players) {
    next[6] = applyIndexedDelta((next[6] as any[]) ?? [], delta.players);
  }

  if (delta.tiles) {
    next[7] = applyIndexedDelta((next[7] as any[]) ?? [], delta.tiles);
  }

  if (delta.hqLocs) {
    next[8] = applyIndexedDelta((next[8] as any[]) ?? [], delta.hqLocs);
  }

  return next;
}

export function serializeState(state: CoreGameState): WireState {
  // 1. Map Player IDs to compact Integer Slots
  const playerSlots = new Map<string, number>();
  let slotIndex = 0;
  for (const playerId of state.players.keys()) {
    playerSlots.set(playerId, slotIndex++);
  }

  // 2. Serialize Players
  const playersArr = Array.from(state.players.values()).map(p => {
    const pArr: any[] = [
      p.id,                                // 0: Need full ID here once
      p.username,                          // 1
      p.color,                             // 2
      STATUS_MAP[p.status],                // 3
      p.gold,                              // 4: EXACT
      p.army,                              // 5: EXACT
      p.eliminated ? 1 : 0,                // 6
      p.hqPos.q,                           // 7
      p.hqPos.r,                           // 8
      p.lastSeen,                          // 9: EXACT
      p.isBot ? 1 : 0,                     // 10
      p.buildings.fort,                    // 11
      p.buildings.barracks,                // 12
      p.buildings.house,                   // 13
      p.buildings.laboratory,              // 14
      p.buildings.siege_outpost,           // 15
      p.buildings.harbor,                  // 16
      null,                                 // 17: reserved (legacy effects slot placeholder)
      p.skinId ?? null                     // 18
    ];

    if (p.effects.length > 0) {
      pArr[17] = p.effects.map(e => [
        PLY_EFF_MAP[e.type],
        e.durationLeft,                    // EXACT
        e.sourcePlayerId ? playerSlots.get(e.sourcePlayerId) ?? null : null
      ]);
    }
    return pArr;
  });

  // 3. Serialize Tiles
  const tilesArr = Array.from(state.tiles.values()).map(t => {
    const tArr: any[] = [
      t.q,                                               // 0
      t.r,                                               // 1
      t.ownerId ? playerSlots.get(t.ownerId) ?? null : null, // 2: SLOT
      Math.round(t.defense),                             // 3: ROUNDED
      t.building ? BLD_MAP[t.building] : null,           // 4: INT
      TERRAIN_MAP[t.terrain] ?? 0,                       // 5: INT
      Math.round(t.baseDefense),                         // 6: ROUNDED
      
      // We pad missing nested structures with null so array indices align
      t.capture ? [                                      // 7: Capture Tuple
        playerSlots.get(t.capture.by) ?? null,
        // remaining fraction (1..0)
        (t.capture.remaining !== undefined ? t.capture.remaining : 1),
        Math.round(t.capture.cost),                      // ROUNDED
        t.capture.completeAt ?? null,                    // optional timestamp (ms)
        t.capture.naval?.sourceHarborKey ?? null,
        t.capture.naval?.waterTilesCrossed ?? null,
        t.capture.naval?.path ?? null
      ] : null,
      
      t.buildingAction ? [                               // 8: Action Tuple
        BLD_MAP[t.buildingAction.building],
        t.buildingAction.readyAt,                        // EXACT (CRUCIAL)
        t.buildingAction.actionType === "CONSTRUCTING" ? 0 : 1
      ] : null,
      
      t.effects.length > 0 ? t.effects.map(e => [        // 9: Effects Tuple Array
        TILE_EFF_MAP[e.type],
        e.durationLeft,                                  // EXACT
        e.sourcePlayerId ? playerSlots.get(e.sourcePlayerId) ?? null : null
      ]) : null,

      t.defenseHeat || null,                             // 10: EXACT (CRUCIAL)
      t.lastDefendedAt || null,                          // 11: EXACT (CRUCIAL)
      t.specialBuilding ? SPECIAL_BLD_MAP[t.specialBuilding] : null // 12: Special building
    ];

    // TRUNCATE TAIL: Pop off any trailing nulls. 
    // If a tile has no capture, action, effects, and heat/defense are 0, 
    // the array stops at index 6, saving massive space.
    while (tArr.length > 0 && tArr[tArr.length - 1] === null) {
      tArr.pop();
    }
    return tArr;
  });

  // 4. De-duplicate HQ Locations (Just send [slot, q, r])
  const hqLocsArr = Array.from(state.HQLocations.entries()).map(([pId, tile]) => [
    playerSlots.get(pId) ?? -1,
    tile.q,
    tile.r
  ]);

  // 5. Build Top Level
  return [
    PHASE_MAP[state.phase],                              // 0
    state.started ? 1 : 0,                               // 1
    state.placementTimeLeft ?? null,                     // 2
    state.gameOver
      ? [
          playerSlots.get(state.gameOver.winner) ?? null,
          state.gameOver.reason === "TERRITORY" ? 1 : 0
        ]
      : null,                                            // 3
    state.mapId,                                         // 4
    state.mapName,                                       // 5
    playersArr,                                          // 6
    tilesArr,                                            // 7
    hqLocsArr                                            // 8
  ];
}

export function deserializeState(raw: WireState): CoreGameState {
  const slotToPlayerId = new Map<number, string>();

  // 1. Rebuild Players First (We need the slot IDs for tiles)
  const players = new Map<string, PlayerState>();
  const rawPlayers: any[] = raw[6] || [];
  
  for (let i = 0; i < rawPlayers.length; i++) {
    const pArr = rawPlayers[i];
    const pId = pArr[0];
    slotToPlayerId.set(i, pId);

    const effRaw = pArr[17];
    
    players.set(pId, {
      id: pId,
      username: pArr[1],
      color: pArr[2],
      status: STATUS_REV[pArr[3]] as any,
      gold: pArr[4],
      army: pArr[5],
      eliminated: pArr[6] === 1,
      hqPos: { q: pArr[7], r: pArr[8] },
      lastSeen: pArr[9],
      isBot: pArr[10] === 1,
      buildings: {
        fort: pArr[11] ?? 0,
        barracks: pArr[12] ?? 0,
        house: pArr[13] ?? 0,
        laboratory: pArr[14] ?? 0,
        siege_outpost: pArr[15] ?? 0,
        harbor: pArr[16] ?? 0
      },
      skinId: pArr[18] ?? null,
      effects: effRaw ? effRaw.map((e: any) => ({
        type: PLY_EFF_REV[e[0]] as any,
        durationLeft: e[1],
        sourcePlayerId: e[2] !== null ? slotToPlayerId.get(e[2]) ?? null : null
      })) : []
    });
  }

  // Helper to map slot integer back to player string
  const getPId = (slot: number | null) => slot !== null ? slotToPlayerId.get(slot) ?? null : null;

  // 2. Rebuild Tiles
  const tiles = new Map<string, TileState>();
  const rawTiles: any[] = raw[7] || [];

  for (const tArr of rawTiles) {
    const q = tArr[0];
    const r = tArr[1];
    
    const capRaw = tArr[7];
    const actRaw = tArr[8];
    const effRaw = tArr[9];

    const tileObj: TileState = {
      q,
      r,
      ownerId: getPId(tArr[2]),
      defense: tArr[3],
      building: tArr[4] !== null ? BLD_REV[tArr[4]] as any : null,
      terrain: TERRAIN_REV[tArr[5]] as any,
      baseDefense: tArr[6],
      
      capture: capRaw ? {
        by: getPId(capRaw[0])!,
        remaining: capRaw[1],
        cost: capRaw[2],
        completeAt: capRaw[3] ?? null,
        naval: capRaw[4] ? {
          sourceHarborKey: capRaw[4],
          waterTilesCrossed: capRaw[5] ?? 0,
          path: capRaw[6] ?? []
        } : undefined
      } as any : null,
      
      buildingAction: actRaw ? {
        building: BLD_REV[actRaw[0]] as any,
        readyAt: actRaw[1],
        actionType: actRaw[2] === 0 ? "CONSTRUCTING" : "DEMOLISHING"
      } : null,
      
      effects: effRaw ? effRaw.map((e: any) => ({
        type: TILE_EFF_REV[e[0]] as any,
        durationLeft: e[1],
        sourcePlayerId: getPId(e[2])
      })) : [],

      defenseHeat: tArr[10] ?? 0,
      lastDefendedAt: tArr[11] ?? 0,
      specialBuilding: tArr[12] !== undefined && tArr[12] !== null ? SPECIAL_BLD_REV[tArr[12]] as any : null
    };

    tiles.set(`${q},${r}`, tileObj);
  }

  // 3. Rebuild HQ Locations Map (Using exact TileState references from the map!)
  const HQLocations = new Map<string, TileState>();
  const rawHQs: any[] = raw[8] || [];
  for (const [slot, q, r] of rawHQs) {
    const pId = getPId(slot);
    const tileRef = tiles.get(`${q},${r}`);
    if (pId && tileRef) {
      HQLocations.set(pId, tileRef);
    }
  }

  // 4. Return Assembly
  const goRaw = raw[3];
  
  return {
    phase: PHASE_REV[raw[0]] as any,
    started: raw[1] === 1,
    placementTimeLeft: raw[2],
    gameOver: goRaw !== null
      ? {
          winner: getPId(goRaw[0])!,
          reason: goRaw[1] === 1 ? "TERRITORY" : "ELIMINATION"
        }
      : null,
    mapId: raw[4],
    mapName: raw[5],
    players,
    tiles,
    HQLocations,
    connectedCache: null,
    waterNetwork: null
  };
}