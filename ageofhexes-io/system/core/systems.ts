
import type { PlayerId, TileState, BuildingType, TileEffectType, TileEffect, PlayerState,
  PlayerEffectType, PlayerEffect, SiegeAttackType, SpecialAttackDefinition } from "../../shared/index.js";
import { calculateCaptureRate, key, neighbors, findPathOverTerrain, getClosestNavalHarborKey,
   isConnectedViaWaterFast, computeConnectedTilesViaHarbors, getHexDistance, getEffectiveGoldCost, 
   hexDistance} from "../../shared/util.js";
import { BASE_CAPTURE_COST, FORT_DEFENSE_ADJACENT, FORT_DEFENSE_SELF,
  HQ_DEFENSE_ADJACENT, HQ_DEFENSE_SELF, GOLD_PER_TILE, BASE_ARMY_MAX, BASE_GOLD_MAX, ARMY_CAP_PER_TILE, CAPTURE_RATE,
  GOLD_PASSIVE, ARMY_PASSIVE, BARRACKS_ARMY_BONUS, DEFEND_COST_RATIO, BUILDING_COST,
  DEMOLISH_REFUND_RATIO, GOLD_PEAK, ARMY_PEAK,  DEFENSE_HEAT_MAX, DEFENSE_HEAT_DECAY_MS,
  DEFENSE_COST_INCREMENT, TILE_ATTACK_COOLDOWN, BUILDING_LIMIT, HOUSE_ARMY_CAP_BONUS, ARMY_PER_TILE,
  TILES_UNTIL_MAX_ATTACKTIME_INCREASE, MAX_ATTACKTIME_INCREASE, NEUTRAL_TILE_CAPTURE_GOLD,
  PLAYER_KILL_GOLD_REWARD, EFFECT_DURATIONS, EFFECT_STRENGTHS, EFFECT_COSTS, BUILDING_CONSTRUCTION_TIME,
  BUILDING_DEMOLISH_TIME, HARBOR_ATTACK_TIME_INCREASE, SPECIAL_ATTACK_COSTS, SPECIAL_ATTACK_RANGES,
  SPECIAL_ATTACK_TRAVEL_TIME_PER_TILE_MS, TERRITORY_WIN_PERCENT, PLAGUE_SPREAD_INTERVAL_MS, PLAGUE_DEFENSE_BONUS,
  PLAGUE_RADIUS, PLAGUE_SOURCE_DEFENSE_BONUS,
  ARMY_TILE_CAP,
  GOLD_TILE_CAP,
} from "../../shared/constants.js";
import type { CoreGameState } from "./state.js";
import { handlePlaceHQ } from "./state.js";
import { getTile, isAdjacentOwned, isAdjacentOwnedAndConnected } from "./state.js";
import { sendPlayerLog, updatePlayerStat, sendMatchResults } from "../../server/src/index.js";

export type Intent =
  | { type: "PLACE_HQ"; q: number; r: number }
  | { type: "CAPTURE"; q: number; r: number }
  | { type: "BUILD"; q: number; r: number; buildingType: string }
  | { type: "DEMOLISH"; q: number; r: number }
  | { type: "DEFEND"; q: number; r: number }
  | { type: "SPECIAL_ATTACK"; q: number; r: number; attackType: SiegeAttackType }
  | { type: "JOIN_QUEUE"; username: string }
  | { type: "RETURN_LOBBY" }
  | { type: "PING" }
  | { type: "BUY_PLAYER_EFFECT"; effectType: PlayerEffectType; targetPlayerId: PlayerId }
  | null;

export type PreparedSpecialAttack = {
  casterId: PlayerId;
  attackType: SiegeAttackType;
  sourceQ: number;
  sourceR: number;
  targetQ: number;
  targetR: number;
  distance: number;
  travelMs: number;
};

export type AppliedIntentResult = {
  specialAttack: PreparedSpecialAttack;
} | null;

const VALID_BUILDINGS = new Set<string>(Object.keys(BUILDING_COST));
const VALID_EFFECTS = new Set<string>(Object.keys(EFFECT_COSTS));
const VALID_SPECIAL_ATTACKS = new Set<string>(Object.keys(SPECIAL_ATTACK_COSTS));

const SPECIAL_ATTACKS: Record<SiegeAttackType, SpecialAttackDefinition> = {
  BOMBARD: {
    cost: SPECIAL_ATTACK_COSTS.BOMBARD,
    range: SPECIAL_ATTACK_RANGES.BOMBARD,
    canTarget: (_state, _casterId, tile) => {
      if (tile.building === "HQ") return false;
      if (hasTileEffect(tile, "BROKEN_GROUND")) return false;
      if (tile.terrain === "BEDROCK" || tile.terrain === "WATER") return false;
      return true;
    },
    execute: executeBombardAttack,
  },
  PLAGUE_BOMB: {
    cost: SPECIAL_ATTACK_COSTS.PLAGUE_BOMB,
    range: SPECIAL_ATTACK_RANGES.PLAGUE_BOMB,
    canTarget: (_state, _casterId, tile) => {
      if (!tile.ownerId) return false;
      if (tile.building || tile.buildingAction) return false;
      if (hasTileEffect(tile, "PLAGUED")) return false;
      return true;
    },
    execute: executePlagueBombAttack,
  },
};

export function captureCost(defense: number) {
  return BASE_CAPTURE_COST * defense;
}

function applyAdjacencyBonus(
  state: CoreGameState,
  tile: TileState,
  selfBonus: number,
  adjacentBonus: number
) {
  tile.defense += selfBonus;

  for (const n of neighbors(tile.q, tile.r)) {
    const t = getTile(state, n.q, n.r);
    if (t && t.ownerId === tile.ownerId) {
      t.defense += adjacentBonus;
    }
  }
}

export function recalcDefense(state: CoreGameState) {
  // PASS 1: reset to immutable base
  for (const tile of state.tiles.values()) {
    tile.defense = tile.baseDefense;
  }

  // PASS 2: apply owned-tile modifiers
  for (const tile of state.tiles.values()) {
    const owner = tile.ownerId;
    if (owner) {
      if (tile.building === "FORT") {
        applyAdjacencyBonus(
          state,
          tile,
          FORT_DEFENSE_SELF,
          FORT_DEFENSE_ADJACENT
        );
      } else if (tile.building === "HQ") {
        applyAdjacencyBonus(
          state,
          tile,
          HQ_DEFENSE_SELF,
          HQ_DEFENSE_ADJACENT
        );
      }
    } else {
      // Plague effect increases defense of tile
      if(hasTileEffect(tile, "PLAGUED")) {
        tile.defense += PLAGUE_DEFENSE_BONUS;

        // Double defense for Plague Source tiles
        if (tile.specialBuilding === "PLAGUE_SOURCE") {
          tile.defense += PLAGUE_SOURCE_DEFENSE_BONUS;
        }
      }
    }

  }
}

export function placeHQ(state: CoreGameState, q: number, r: number, playerId: PlayerId) {
  const tile = getTile(state, q, r);
  if (!tile) throw new Error("Cannot place HQ on invalid tile");
  tile.ownerId = playerId;
  tile.building = "HQ";
  recalcDefense(state);
}

export function canStartCapture(state: CoreGameState, playerId: PlayerId, q: number, r: number) {
  const tile = getTile(state, q, r);
  const player = state.players.get(playerId);
  if (!tile || !player) return false;
  if (tile.ownerId === playerId) return false;
  if (tile.terrain === "BEDROCK" || tile.terrain === "WATER") return false;
  if (tile.capture) return false;
  if(Date.now() - tile.lastDefendedAt < TILE_ATTACK_COOLDOWN) return false
  const targetKey = key(q, r);
  const hasLandAttack = isAdjacentOwnedAndConnected(state, q, r, playerId);
  const hasNavalAttack = hasLandAttack ? false : canStartNavalCapture(state, playerId, targetKey);
  if (!hasLandAttack && !hasNavalAttack) return false;
  const cost = captureCost(tile.defense);
  return player.army >= cost;
}

export function canContinueCapture(state: CoreGameState, playerId: PlayerId, q: number, r: number) {
  const tile = getTile(state, q, r);
  const player = state.players.get(playerId);
  if (!tile || !player) return false;
  if (tile.ownerId === playerId) return false;
  if (tile.terrain === "BEDROCK" || tile.terrain === "WATER") return false;

  if (tile.capture?.naval) {
    return canContinueNavalCapture(state, playerId, q, r, tile.capture.naval.sourceHarborKey);
  }

  // still must keep adjacency + supply while capturing
  if (!isAdjacentOwnedAndConnected(state, q, r, playerId)) return false;
  return true;
}

function canStartNavalCapture(state: CoreGameState, playerId: PlayerId, targetKey: string): boolean {
  const network = state.waterNetwork;
  if (!network) return false;

  const targetTile = state.tiles.get(targetKey);
  if (!targetTile || targetTile.building === "HQ" || targetTile.building === "HARBOR") return false;

  const harborKey = getClosestNavalHarborKey(state, playerId, targetKey, network);
  if (!harborKey) return false;

  return isConnectedViaWaterFast(network.landToWaterBodies, harborKey, targetKey);
}

function canContinueNavalCapture(
  state: CoreGameState,
  playerId: PlayerId,
  q: number,
  r: number,
  sourceHarborKey: string
): boolean {
  const network = state.waterNetwork;
  if (!network) return false;

  const harborTile = state.tiles.get(sourceHarborKey);
  if (!harborTile) return false;
  if (harborTile.ownerId !== playerId || harborTile.building !== "HARBOR") return false;
  if (!isTileConnectedToHQ(state, playerId, harborTile.q, harborTile.r)) return false;

  const targetKey = key(q, r);
  const targetTile = state.tiles.get(targetKey);
  if (!targetTile || targetTile.building === "HARBOR") return false;
  
  return isConnectedViaWaterFast(network.landToWaterBodies, sourceHarborKey, targetKey);
}

function getWaterTilesCrossed(state: CoreGameState, path: string[]): number {
  let count = 0;
  for (let i = 0; i < path.length; i++) {
    const tile = state.tiles.get(path[i]);
    if (tile?.terrain === "WATER") count++;
  }
  return count;
}

function computeCaptureRateWithMode(
  state: CoreGameState,
  tile: TileState,
  attackerId: PlayerId,
  waterTilesCrossed: number
): number {
  const defenderTerritorySize = tile.ownerId
    ? (state.connectedCache?.get(tile.ownerId)?.size ?? 0)
    : 0;

  const attackingPlayer = state.players.get(attackerId);
  const speedBoost = hasPlayerEffect(attackingPlayer, "ATTACK_SPEED")
    ? EFFECT_STRENGTHS["ATTACK_SPEED"]
    : 1;

  const baseRate = calculateCaptureRate(tile.defense, defenderTerritorySize, speedBoost);
  if (waterTilesCrossed <= 0) return baseRate;

  const baseDurationSeconds = baseRate > 0 ? (1 / baseRate) : Infinity;
  const navalPenaltySeconds = (HARBOR_ATTACK_TIME_INCREASE * waterTilesCrossed) / 1000;
  const totalDurationSeconds = baseDurationSeconds + navalPenaltySeconds;

  return totalDurationSeconds > 0 ? (1 / totalDurationSeconds) : 0;
}

export function hasTileEffect(tile: TileState, effectType: TileEffectType): boolean {
  return tile.effects.some((effect) => effect.type === effectType);
}

function hasConnectedSiegeOutpostInRange(
  state: CoreGameState,
  playerId: PlayerId,
  q: number,
  r: number,
  range: number
): { sourceQ: number; sourceR: number; distance: number } | null {
  let best: { sourceQ: number; sourceR: number; distance: number } | null = null;

  for (const sourceTile of state.tiles.values()) {
    if (sourceTile.ownerId !== playerId) continue;
    if (sourceTile.building !== "SIEGE_OUTPOST") continue;
    if (!isTileConnectedToHQ(state, playerId, sourceTile.q, sourceTile.r)) continue;

    const distance = getHexDistance(sourceTile.q, sourceTile.r, q, r);
    if (distance <= range && (!best || distance < best.distance)) {
      best = { sourceQ: sourceTile.q, sourceR: sourceTile.r, distance };
    }
  }

  return best;
}

export function prepareSpecialAttack(
  state: CoreGameState,
  casterId: PlayerId,
  q: number,
  r: number,
  attackType: SiegeAttackType
): PreparedSpecialAttack | null {
  const caster = state.players.get(casterId);
  const targetTile = getTile(state, q, r);
  if (!caster || !targetTile) return null;

  const attack = SPECIAL_ATTACKS[attackType];
  if (!attack) return null;

  const effectiveAttackCost = getEffectiveGoldCost(caster, attack.cost);
  if (caster.gold < effectiveAttackCost) return null;

  const source = hasConnectedSiegeOutpostInRange(state, casterId, q, r, attack.range);
  if (!source) return null;
  
  if (!attack.canTarget(state, casterId, targetTile)) return null;

  const travelMs = Math.max(0, Math.round(source.distance * SPECIAL_ATTACK_TRAVEL_TIME_PER_TILE_MS));

  modifyPlayerResources(state, caster, "gold", -effectiveAttackCost);
  return {
    casterId,
    attackType,
    sourceQ: source.sourceQ,
    sourceR: source.sourceR,
    targetQ: q,
    targetR: r,
    distance: source.distance,
    travelMs,
  };
}

export function executePreparedSpecialAttack(
  state: CoreGameState,
  prepared: PreparedSpecialAttack
): boolean {
  const caster = state.players.get(prepared.casterId);
  const targetTile = getTile(state, prepared.targetQ, prepared.targetR);
  if (!caster || !targetTile) return false;

  const attack = SPECIAL_ATTACKS[prepared.attackType];
  if (!attack) return false;

  const success = attack.execute(state, prepared.casterId, targetTile);
  if (!success) return false;

  
  return true;
}

export function tryCapture(
  state: CoreGameState,
  playerId: PlayerId,
  q: number,
  r: number
) {
  const tile = getTile(state, q, r);
  const player = state.players.get(playerId);
  if (!tile || !player) return false; //

  if (tile.ownerId === playerId) return false; // 
  if (tile.terrain === "BEDROCK" || tile.terrain === "WATER") return false;

  // Already being captured by same player → ignore . what if another player
  if (tile.capture && tile.capture.by !== playerId) {
    return false;
  }

  if (tile.capture && tile.capture.by === playerId) return true;

  const cost = captureCost(tile.defense);
  if (player.army < cost) return false;

  if (tile.lastDefendedAt && Date.now() - tile.lastDefendedAt < TILE_ATTACK_COOLDOWN) return false;

  const targetKey = key(q, r);
  const hasLandAttack = isAdjacentOwnedAndConnected(state, q, r, playerId);
  let navalCapture: { sourceHarborKey: string; waterTilesCrossed: number; path: string[] } | null = null;

  if (!hasLandAttack) {
    const network = state.waterNetwork;
    if (!network) return false;
    if (tile.building === "HQ" || tile.building === "HARBOR") return false;

    const harborKey = getClosestNavalHarborKey(state, playerId, targetKey, network);
    if (!harborKey) return false;

    const harborTile = state.tiles.get(harborKey);
    if (!harborTile) return false;
    if (!isTileConnectedToHQ(state, playerId, harborTile.q, harborTile.r)) return false;

    const path = findPathOverTerrain(state, harborKey, targetKey, "WATER");
    if (!path || path.length < 2) return false;

    navalCapture = {
      sourceHarborKey: harborKey,
      waterTilesCrossed: getWaterTilesCrossed(state, path),
      path,
    };
  }

  // Pay upfront
  modifyPlayerResources(state, player, 'army', -cost);

  const waterTilesCrossed = navalCapture?.waterTilesCrossed ?? 0;
  const rate = computeCaptureRateWithMode(state, tile, playerId, waterTilesCrossed);
  const durationMs = rate > 0 ? (1000 / rate) : Infinity;

  tile.capture = {
    by: playerId,
    remaining: 1, // fraction of work left (1 = 100%)
    cost,
    completeAt: Date.now() + durationMs,
    naval: navalCapture ?? undefined,
  };

  return true;
}

export function tryDefend(state: CoreGameState, playerId: PlayerId, q: number, r: number) {
  const tile = getTile(state, q, r);
  const player = state.players.get(playerId);
  if (!tile || !player) return false;

  if (!tile.capture) return false;                 
  if (tile.ownerId !== playerId) return false;    
  if (!isTileConnectedToHQ(state, playerId, q, r)) return false;
  
  const heatCostIncrease = tile.defenseHeat * DEFENSE_COST_INCREMENT

  const cost = Math.ceil(tile.capture.cost * (DEFEND_COST_RATIO + heatCostIncrease)) ;
  if (player.army < cost) return false;

  modifyPlayerResources(state, player, 'army', -cost);
  tile.capture = null; // cancel capture

  tile.defenseHeat = Math.min(tile.defenseHeat + 1, DEFENSE_HEAT_MAX); 
  tile.lastDefendedAt = Date.now();
  return true;
}

export function tryBuild(
  state: CoreGameState,
  playerId: PlayerId,
  q: number,
  r: number,
  buildingType: BuildingType,
) {
  const tile = getTile(state, q, r);
  const player = state.players.get(playerId);
  if (!tile || !player) return false;
  if (tile.ownerId !== playerId) return false;
  if (tile.building !== null || tile.buildingAction !== null) return false;
  if (hasTileEffect(tile, "BROKEN_GROUND")) return false;
  const effectiveBuildCost = getEffectiveGoldCost(player, BUILDING_COST[buildingType]);
  if (player.gold < effectiveBuildCost) return false;
  if (!isTileConnectedToHQ(state, playerId, q, r)) return false;
  if (buildingType === "HARBOR") {
    const hasAdjacentWater = neighbors(q, r).some((n) => {
      const adjacentTile = getTile(state, n.q, n.r);
      return adjacentTile?.terrain === "WATER";
    });
    if (!hasAdjacentWater) return false;
  }
  const bKey = buildingType.toLowerCase() as keyof typeof player.buildings;

  let constructingCount = 0;
  for (const t of state.tiles.values()) {
    if (
      t.ownerId === playerId &&
      t.buildingAction?.actionType === "CONSTRUCTING" &&
      t.buildingAction?.building === buildingType
    ) {
      constructingCount++;
    }
  }
  if(player.buildings[bKey] + constructingCount >= BUILDING_LIMIT[buildingType]) return false

  modifyPlayerResources(state, player, 'gold', -effectiveBuildCost);

  const durationMs = BUILDING_CONSTRUCTION_TIME[buildingType] * 1000; // in ms
  tile.buildingAction = {
    building: buildingType,
    actionType: "CONSTRUCTING",
    readyAt: Date.now() + durationMs
  };

  return true;
}

export function tick(state: CoreGameState, dt: number) {
  if (state.phase === "HQ_PLACEMENT") return;

  dt = Math.min(dt, 0.25);
  const now = Date.now()

  state.connectedCache = new Map();
  if (now - (state.lastPlagueSpreadAt ?? now) >= PLAGUE_SPREAD_INTERVAL_MS) {
    spreadPlagueFromSources(state);
    state.lastPlagueSpreadAt = now;
  }

  for (const p of state.players.values()) {
    if (!p.eliminated && p.status === "PLAYING") {
      state.connectedCache.set(
        p.id,
        computeConnectedTilesFromHQ(state, p.id)
      );
      if(p.effects && p.effects.length > 0){
        for (let i = p.effects.length - 1; i >= 0; i--) {
          const effect = p.effects[i];
          if (effect.durationLeft !== null){
            effect.durationLeft -= dt * 1000;
            if (effect.durationLeft <= 0){
              p.effects.splice(i, 1);
            }
          }
        }
      }
    }
  }

  // Count connected tiles + barracks
  const ownedCount = new Map<PlayerId, number>();

  for (const t of state.tiles.values()) {

    // ==== TILE EFFECTS ====
    if (t.effects && t.effects.length > 0) {
      for (let i = t.effects.length - 1; i >= 0; i--) {
        const effect = t.effects[i];
        if (effect.durationLeft !== null){
          effect.durationLeft -= dt * 1000;
          
          if (effect.durationLeft <= 0) {
            t.effects.splice(i, 1);
            recalcDefense(state);
          }
        }
      }
      
    }

    if (t.capture) {
      const by = t.capture.by;

      // If capture conditions no longer valid → cancel
      if (!canContinueCapture(state, by, t.q, t.r)) {
        t.capture = null;
        continue;
      }

      // capture progress (big territory = more time to capture)
      // Naval captures share the same intent/progress pipeline, but with extra duration.
      const waterTilesCrossed = t.capture.naval?.waterTilesCrossed ?? 0;
      const rate = computeCaptureRateWithMode(state, t, by, waterTilesCrossed);
      const attackingPlayer = state.players.get(by);

      const dec = rate * dt;
      t.capture.remaining = Math.max(0, (t.capture.remaining ?? 1) - dec);

      // Update estimated completion timestamp (for persistence/clients)
      t.capture.completeAt = t.capture.remaining > 0 ? Date.now() + (t.capture.remaining / Math.max(rate, 1e-6)) * 1000 : Date.now();

      if ((t.capture.remaining ?? 1) <= 0) {
        // === FINISH CAPTURE ===
        const prevOwner = t.ownerId;
        const prevBuilding = t.building;
        const wasHQ = t.building === "HQ";

        // if there was construction/demolishing action (HAS TO BE BEFORE BUILDING CLEARING)
        if (t.buildingAction) {
          t.buildingAction = null; 
        }

        // building clearing / owning
        if(prevBuilding && attackingPlayer){
          const defendingPlayer = state.players.get(String(t.ownerId))
          if(attackingPlayer && defendingPlayer){
            if (prevBuilding === "BARRACKS") {
              defendingPlayer.buildings.barracks--;
              if(attackingPlayer.buildings.barracks < BUILDING_LIMIT["BARRACKS"]){
                t.building = "BARRACKS";
                attackingPlayer.buildings.barracks++;
              } else
                t.building = null;
            } else if (prevBuilding === "HOUSE") {
              defendingPlayer.buildings.house--;
              if(attackingPlayer.buildings.house < BUILDING_LIMIT["HOUSE"]){
                t.building = "HOUSE";
                attackingPlayer.buildings.house++;
              } else
                t.building = null;
            } else if(prevBuilding === "FORT") {
              t.building = null;
              defendingPlayer.buildings.fort--;
            } else if(prevBuilding === "HQ") {
              t.building = null;
            } else if (prevBuilding === "LABORATORY") {
              defendingPlayer.buildings.laboratory--;
              t.building = null;
            } else if(prevBuilding === "SIEGE_OUTPOST") {
              t.building = null;
              defendingPlayer.buildings.siege_outpost--;
            } else if (prevBuilding === "HARBOR") {
              defendingPlayer.buildings.harbor--;
              t.building = null;
            } else {
              t.building = null;
            }
          }
        }
        if(attackingPlayer && !t.ownerId){
          const gain = Math.min(BASE_GOLD_MAX, attackingPlayer.gold + NEUTRAL_TILE_CAPTURE_GOLD * t.baseDefense) - attackingPlayer.gold;
          if (gain !== 0) modifyPlayerResources(state, attackingPlayer, 'gold', gain);
          sendPlayerLog(attackingPlayer.id, `+${NEUTRAL_TILE_CAPTURE_GOLD * t.baseDefense} Gold (Tile Captured)`, "#eab308");  
        }
        
        t.ownerId = by;
        t.defenseHeat = 0;
        t.lastDefendedAt = 0;
        t.capture = null;
        if (t.specialBuilding === "PLAGUE_SOURCE") {
          t.specialBuilding = null;
        }
        if (hasTileEffect(t, "PLAGUED")) {
          t.effects = t.effects.filter(effect => effect.type !== "PLAGUED");
        }
        updatePlayerStat(by, "tilesCaptured", 1)
        recalcDefense(state);

        if (wasHQ && prevOwner && prevOwner !== by) {
          handlePlayerDeath(state, prevOwner);
          updatePlayerStat(by, "playersEliminated", 1);
          if(attackingPlayer){
            const gain = Math.min(BASE_GOLD_MAX, attackingPlayer.gold + PLAYER_KILL_GOLD_REWARD) - attackingPlayer.gold;
            if (gain !== 0) modifyPlayerResources(state, attackingPlayer, 'gold', gain);
            sendPlayerLog(attackingPlayer.id, `+${PLAYER_KILL_GOLD_REWARD} Gold (Eliminated Player)`, "#eab308");  
          }
        }

        
      }
      
    }
    if (!t.ownerId) continue;

    // reset heat for necessary tiles with owner
    if (now - t.lastDefendedAt > DEFENSE_HEAT_DECAY_MS) {
      t.defenseHeat = 0;
    }

    // check buildingAction for completion
    if (t.buildingAction && now >= t.buildingAction.readyAt) {
      const action = t.buildingAction;
      const tileOwner = state.players.get(t.ownerId);

      if (tileOwner) {
        if (action.actionType === "CONSTRUCTING") {
          const bKey = action.building.toLowerCase() as keyof typeof tileOwner.buildings;
          const currentCount = tileOwner.buildings[bKey] ?? 0;
          const limit = BUILDING_LIMIT[action.building];

          // Re-check cap at completion time: ownership can change while construction is in progress.
          if (currentCount >= limit) {
            sendPlayerLog(tileOwner.id, `Construction of ${action.building} canceled (limit reached)`, "#f5260b");
          } else {
            // Finalize structure assembly only if still under cap.
            t.building = action.building;
            tileOwner.buildings[bKey] = currentCount + 1;

            if (action.building === "FORT") {
              recalcDefense(state);
            }
            sendPlayerLog(tileOwner.id, `Construction of ${action.building} completed`, "#1f6ce0");
          }
        }  
        else if (action.actionType === "DEMOLISHING") {
          // Calculate refund values & decrement building counters upon completion
          const cost = BUILDING_COST[action.building];
          const refund = Math.floor(cost * DEMOLISH_REFUND_RATIO);
          
          const gain = Math.min(BASE_GOLD_MAX, tileOwner.gold + refund) - tileOwner.gold;
          if (gain !== 0) modifyPlayerResources(state, tileOwner, 'gold', gain);
          
          const bKey = action.building.toLowerCase() as keyof typeof tileOwner.buildings;
          tileOwner.buildings[bKey] = Math.max(0, tileOwner.buildings[bKey] - 1);

          // Clear out layout references
          t.building = null;
          recalcDefense(state);
          sendPlayerLog(tileOwner.id, `Demolition of ${action.building} completed`, "#1f6ce0");
        }
      }

      // Finalize the lifecycle event
      t.buildingAction = null;
    }

    const set = state.connectedCache.get(t.ownerId);
    if (!set) continue;
    if (!set.has(key(t.q, t.r))) continue; // CUT OFF

    ownedCount.set(t.ownerId, (ownedCount.get(t.ownerId) ?? 0) + 1);
  }

  // Apply income / regen
  for (const p of state.players.values()) {
    if (p.eliminated) continue;
    if (p.status !== "PLAYING") continue;

    const owned = ownedCount.get(p.id) ?? 0;
    const barracks = p.buildings.barracks ?? 0
    const effectiveOwned = Math.max(0, owned - 1);
    const armyCap = BASE_ARMY_MAX + effectiveOwned * ARMY_CAP_PER_TILE + (p.buildings.house ?? 0) * HOUSE_ARMY_CAP_BONUS;

    //army mult from effects
    let armyEffectMult = 1.0;

    const overclock = p.effects?.find(e => e.type === "ARMY_GAIN_BUFF");
    if (overclock && overclock.durationLeft !== null) {
      if (overclock.durationLeft > EFFECT_DURATIONS["ARMY_GAIN_BUFF"] / 2) {
        armyEffectMult = EFFECT_STRENGTHS["ARMY_GAIN_BUFF"];
      } else {
        armyEffectMult = 1 / EFFECT_STRENGTHS["ARMY_GAIN_BUFF"]; 
      }
    }
    // gold optimum around GOLD_PEAK ratio, army optimum around ARMY_PEAK ratio
    // initial falloff is gradual, then steep toward extremes
    const ratio = armyCap > 0 ? p.army / armyCap : 0;
    const armyMult = Math.max(0.4, 1 - 2.2 * Math.pow(ratio - ARMY_PEAK, 2)); // 2.2 is slope decline rate, higher number faster falloff from optimum
    const goldMult = Math.max(0.4, 1 - 1.95 * Math.pow(ratio - GOLD_PEAK, 2)); // exponent is width of bell

    {
      const goldGain = Math.min(
        BASE_GOLD_MAX,
        p.gold + (Math.min(owned * GOLD_PER_TILE, GOLD_TILE_CAP) + GOLD_PASSIVE) * dt * goldMult
      ) - p.gold;
      if (goldGain !== 0) modifyPlayerResources(state, p, 'gold', goldGain);
    }

    {
      const armyGain = Math.min(
        armyCap,
        p.army + (ARMY_PASSIVE + barracks * BARRACKS_ARMY_BONUS + Math.min(owned * ARMY_PER_TILE, ARMY_TILE_CAP)) * dt * armyMult * armyEffectMult
      ) - p.army;
      if (armyGain !== 0) modifyPlayerResources(state, p, 'army', armyGain);
    }
  }
}

export function applyIntent(state: CoreGameState, playerId: PlayerId, intent: any): AppliedIntentResult {
  if (!state?.started || state.gameOver || !intent || typeof intent !== "object") return null;

  const type = intent.type;

  if (type === "PLACE_HQ" && state.phase === "HQ_PLACEMENT") {
    if (typeof intent.q !== "number" || typeof intent.r !== "number") return null;
    handlePlaceHQ(state, playerId, intent.q, intent.r);
    return null;
  }

  if (state.phase === "HQ_PLACEMENT") return null;

  // Validate Hex Coordinates for standard map actions
  const needsCoords = ["CAPTURE", "BUILD", "DEMOLISH", "DEFEND", "SPECIAL_ATTACK"].includes(type);
  if (needsCoords && (typeof intent.q !== "number" || typeof intent.r !== "number")) {
    return null; 
  }

  if (type === "CAPTURE") {
    tryCapture(state, playerId, intent.q, intent.r);
  } 
  else if (type === "BUILD") {
    if (!VALID_BUILDINGS.has(intent.buildingType)) return null;
    tryBuild(state, playerId, intent.q, intent.r, intent.buildingType as BuildingType);
  } 
  else if (type === "DEMOLISH") {
    handleDemolish(state, playerId, intent.q, intent.r);
  } 
  else if (type === "DEFEND") {
    tryDefend(state, playerId, intent.q, intent.r);
  } 
  else if (type === "SPECIAL_ATTACK") {
    if (!VALID_SPECIAL_ATTACKS.has(intent.attackType)) return null;
    const prepared = prepareSpecialAttack(state, playerId, intent.q, intent.r, intent.attackType as SiegeAttackType);
    if (!prepared) return null;
    return { specialAttack: prepared };
  }
  else if (type === "BUY_PLAYER_EFFECT") {
    if (!VALID_EFFECTS.has(intent.effectType)) return null;
    if (intent.targetPlayerId !== undefined && typeof intent.targetPlayerId !== "string") return null;
    
    tryBuyPlayerEffect(state, playerId, intent.effectType, intent.targetPlayerId);
  }

  return null;
}

export function handlePlayerDeath(
  state: CoreGameState,
  deadPlayerId: PlayerId
) {
  // 1. Remove all tiles owned by the player
  for (const tile of state.tiles.values()) {
    if (tile.ownerId === deadPlayerId) {
      tile.ownerId = null;
      tile.building = null;
      tile.defense = 1; // base defense (will be recalculated anyway)
      tile.buildingAction = null;
    }
  }

  // 2. mark player as dead and update stats
  const player = state.players.get(deadPlayerId);
  // count includes this player (not yet marked eliminated), which is exactly their finishing placement
  const placement = Array.from(state.players.values()).filter(p => !p.eliminated).length;
  if (player) {
    player.eliminated = true;
    updatePlayerStat(player.id, "placement", placement);
    updatePlayerStat(player.id, "survivalTimeSeconds", Date.now());
  }

  sendMatchResults(deadPlayerId);
  

  // 3. Recalculate defenses (important!)
  recalcDefense(state);

  // check if there is only one player left alive or if only bots remain
  checkGameOver(state)
}

export function checkGameOver(state: CoreGameState) {
  let aliveCount = 0;
  let lastAliveId: string | null = null;
  let realPlayerInRoom = 0;
  let capturableTileCount = 0;

  for (const p of state.players.values()) {
    if (!p.isBot) realPlayerInRoom++;
    if (p.status === "PLAYING" && !p.eliminated) {
      aliveCount += 1;
      lastAliveId = p.id;
    }
  }

  if (aliveCount <= 1 && lastAliveId) {
    if (lastAliveId) {
      updatePlayerStat(lastAliveId, "placement", 1);
      updatePlayerStat(lastAliveId, "survivalTimeSeconds", Date.now());
      sendMatchResults(lastAliveId);
    }
    state.gameOver = { winner: lastAliveId, reason: "ELIMINATION" };
  } else if (realPlayerInRoom <= 0) {
    state.gameOver = { winner: lastAliveId ? lastAliveId : "BOTS", reason: "ELIMINATION" };
  } else {
    for (const tile of state.tiles.values()) {
      if (tile.terrain !== "WATER" && tile.terrain !== "BEDROCK") {
        capturableTileCount += 1;
      }
    }
    if (capturableTileCount > 0) {
      for (const p of state.players.values()) {
        if (p.status !== "PLAYING" || p.eliminated) continue;
        const territorySize = state.connectedCache?.get(p.id)?.size ?? 0;
        const territoryPercent = (territorySize / capturableTileCount) * 100;
        if (territoryPercent >= TERRITORY_WIN_PERCENT) {
          updatePlayerStat(p.id, "placement", 1);
          updatePlayerStat(p.id, "survivalTimeSeconds", Date.now());
          sendMatchResults(p.id);

          for (const other of state.players.values()) {
            if (other.id !== p.id && !other.eliminated && !other.isBot) {
              updatePlayerStat(other.id, "placement", 2);
              updatePlayerStat(other.id, "survivalTimeSeconds", Date.now());
              sendMatchResults(other.id);
            }
          }
          state.gameOver = { winner: p.id, reason: "TERRITORY" };
          return;
        }
      }
    }
  }
}

export function computeConnectedTilesFromHQ(
  state: CoreGameState,
  playerId: PlayerId
): Set<string> {
  const player = state.players.get(playerId);
  return computeConnectedTilesViaHarbors(
    state,
    playerId,
    player?.hqPos ?? null,
    state.waterNetwork ?? null
  );
}

export function getConnectedTilesFromHQ(
  state: CoreGameState,
  playerId: PlayerId
): Set<string> {
  return state.connectedCache?.get(playerId) ?? new Set();
}

export function isTileConnectedToHQ(
  state: CoreGameState,
  playerId: PlayerId,
  q: number,
  r: number
): boolean {
  const connected = getConnectedTilesFromHQ(state, playerId);
  return connected.has(key(q, r));
}

export function handleDemolish(
  state: CoreGameState,
  playerId: PlayerId,
  q: number,
  r: number
) {
  const tile = getTile(state, q, r);
  if (!tile) return;
  if (tile.ownerId !== playerId) return;
  if (!tile.building || tile.building === "HQ") return;
  if (tile.buildingAction !== null) return;

  const player = state.players.get(playerId)
  if(!player) return;
  if (!isTileConnectedToHQ(state, playerId, q, r)) return;

  const durationMs = BUILDING_DEMOLISH_TIME[tile.building] * 1000;
  tile.buildingAction = {
    building: tile.building,
    actionType: "DEMOLISHING",
    readyAt: Date.now() + durationMs
  };
}

export function applyEffectToTile(
  state: CoreGameState,
  q: number,
  r: number,
  type: TileEffectType,
  duration: number | null,
  sourcePlayerId: string | null = null
): boolean {
  const tileKey = `${q},${r}`;
  const tile = state.tiles.get(tileKey);
  
  if (!tile) return false; // Hex tile not found

  // Check if this specific effect type is already running on the tile
  const existingEffect = tile.effects.find((e) => e.type === type);

  if (existingEffect) {
    if (duration === null) {
      existingEffect.durationLeft = null;
    } else if (existingEffect.durationLeft !== null) {
      existingEffect.durationLeft = Math.max(existingEffect.durationLeft, duration);
    }
    existingEffect.sourcePlayerId = sourcePlayerId;

  } else {
    const newEffect: TileEffect = {
      type,
      durationLeft: duration,
      sourcePlayerId
    };
    tile.effects.push(newEffect);
  }

  return true;
}

export function hasPlayerEffect(player: PlayerState | undefined, effectType: PlayerEffectType): boolean {
  return player?.effects.some(effect => effect.type === effectType) ?? false;
}

export function tryBuyPlayerEffect(
  state: CoreGameState,
  casterId: PlayerId,
  effectType: PlayerEffectType,
  targetId: PlayerId
) {
  const caster = state.players.get(casterId);
  const target = state.players.get(targetId);


  if (!caster || caster.eliminated || !target || target.eliminated) return;
  if ((caster.buildings.laboratory ?? 0) <= 0) {
    return;
  }
  const baseCost = EFFECT_COSTS[effectType] ?? 9999;
  const cost = getEffectiveGoldCost(caster, baseCost);
  if (caster.gold < cost) return;

  // reduce gold by cost
  modifyPlayerResources(state, caster, 'gold', -cost);
  
  const duration = EFFECT_DURATIONS[effectType] ?? 10_000;
  applyEffectToPlayer(state, targetId, effectType, duration, casterId);
}

export function applyEffectToPlayer(
  state: CoreGameState,
  playerId: string,
  type: PlayerEffectType,
  duration: number | null,
  sourcePlayerId: string | null = null
): boolean {
  const player = state.players.get(playerId);
  
  if (!player || player.eliminated) return false;

  // Look for an existing instance of this specific effect
  const existingEffect = player.effects.find((e) => e.type === type);

  if (existingEffect) {
    if (duration === null) {
      // If the new effect is permanent, overwrite the timer entirely
      existingEffect.durationLeft = null;
    } else if (existingEffect.durationLeft !== null) {
      // If both are timed, refresh to whichever duration is longer
      existingEffect.durationLeft = Math.max(existingEffect.durationLeft, duration);
    }
    // Update who cast/triggered the modification last
    existingEffect.sourcePlayerId = sourcePlayerId;
  } else {
    // Add a fresh effect object to the collection
    const newEffect: PlayerEffect = {
      type,
      durationLeft: duration,
      sourcePlayerId
    };
    player.effects.push(newEffect);
  }
  const sourcePlayer = state.players.get(sourcePlayerId ?? '');
  if (sourcePlayer && playerId !== sourcePlayerId)
    sendPlayerLog(playerId, `Gained effect: ${type}, by player: ${sourcePlayer.username}`, "#a41ab6");
  else {
    sendPlayerLog(playerId, `Gained effect: ${type}`, "#a41ab6");
  }
  return true;
}

export function modifyPlayerResources(
  state: CoreGameState, 
  player: PlayerState, 
  resource: 'gold' | 'army', 
  amount: number // can be positive or negative
) {
  if (!player) return;

  if (resource === 'gold') {
    player.gold += amount;
    if (amount < 0 && !player.isBot)
      updatePlayerStat(player.id, 'goldSpent', -amount);
  } else if (resource === 'army') {
    player.army += amount;
    if (amount < 0 && !player.isBot)
      updatePlayerStat(player.id, 'armySpent', -amount);
  }
}

// ------------------ SPECIAL ATTACKS HELPERS ------------------------

// BOMBARD
function executeBombardAttack(
  state: CoreGameState,
  casterId: PlayerId,
  tile: TileState
): boolean {
  let changed = false;

  if (tile.building === "HQ") return false;

  if (tile.building) {
    const owner = tile.ownerId ? state.players.get(tile.ownerId) : null;
    if (owner) {
      const bKey = tile.building.toLowerCase() as keyof typeof owner.buildings;
      owner.buildings[bKey] = Math.max(0, owner.buildings[bKey] - 1);
    }
    tile.building = null;
    changed = true;
  }

  if (tile.buildingAction) {
    tile.buildingAction = null;
    changed = true;
  }

  if (!hasTileEffect(tile, "BROKEN_GROUND")) {
    applyEffectToTile(state, tile.q, tile.r, "BROKEN_GROUND", null, casterId);
    changed = true;
  }

  if (changed) {
    recalcDefense(state);
  }

  return changed;
}

// PLAGUE BOMB 
function clearTileOwnership(state: CoreGameState, tile: TileState, ownerId: PlayerId | null) {
  if (tile.building && ownerId) {
    const owner = state.players.get(ownerId);
    if (owner) {
      const bKey = tile.building.toLowerCase() as keyof typeof owner.buildings;
      owner.buildings[bKey] = Math.max(0, owner.buildings[bKey] - 1);
    }
  }

  tile.ownerId = null;
  tile.building = null;
  tile.buildingAction = null;
  tile.capture = null;
  tile.defenseHeat = 0;
  tile.lastDefendedAt = 0;
}

export function executePlagueBombAttack(
  state: CoreGameState,
  casterId: PlayerId,
  tile: TileState
): boolean {
  if (!tile.ownerId) return false;
  if (tile.building || tile.buildingAction) return false;
  if (tile.terrain === "BEDROCK" || tile.terrain === "WATER") return false;

  clearTileOwnership(state, tile, tile.ownerId);
  applyEffectToTile(state, tile.q, tile.r, "PLAGUED", null, casterId);
  tile.specialBuilding = "PLAGUE_SOURCE";
  recalcDefense(state);
  return true;
}

export function findNextPlagueSpreadTarget(state: CoreGameState, sourceTile: TileState): TileState | null {
  const sourceKey = key(sourceTile.q, sourceTile.r);
  const visited = new Set<string>([sourceKey]);
  const queue: TileState[] = [sourceTile];

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const n of neighbors(current.q, current.r)) {
      const next = getTile(state, n.q, n.r);
      if (!next) continue;

      const nextKey = key(next.q, next.r);
      if (visited.has(nextKey)) continue;
      visited.add(nextKey);
      
      if (next.terrain === "BEDROCK" || next.terrain === "WATER" || hexDistance({ q: sourceTile.q, r: sourceTile.r }, { q: next.q, r: next.r }) > PLAGUE_RADIUS) continue;
      if (next.ownerId && next.building !== "HQ" && !hasTileEffect(next, "PLAGUED")) {
        return next;
      }

      if (hasTileEffect(next, "PLAGUED") || next.specialBuilding === "PLAGUE_SOURCE") {
        queue.push(next);
      }
    }
  }

  return null;
}

export function spreadPlagueFromSources(state: CoreGameState) {
  for (const sourceTile of state.tiles.values()) {
    if (sourceTile.specialBuilding !== "PLAGUE_SOURCE") continue;
    const targetTile = findNextPlagueSpreadTarget(state, sourceTile);
    if (!targetTile) {
      sourceTile.specialBuilding = null; // no more targets, remove plague source
      continue;
    }

    clearTileOwnership(state, targetTile, targetTile.ownerId);
    applyEffectToTile(state, targetTile.q, targetTile.r, "PLAGUED", null, targetTile.ownerId);
  }
  recalcDefense(state);
}