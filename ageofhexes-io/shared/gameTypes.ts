export type TerrainType =
  | "GRASS"
  | "MOUNTAIN"
  | "BEDROCK"
  | "DESERT"
  | "WATER";

export type GamePhase = "HQ_PLACEMENT" | "GAMEPLAY";

export type TileEffectType = 
  | "REINFORCED"
  | "BROKEN_GROUND"
  | "PLAGUED";

export type SpecialBuildingType = "PLAGUE_SOURCE";

export interface TileEffect {
  type: TileEffectType;
  durationLeft: number | null; // Remaining time in seconds - null for permanent
  sourcePlayerId: string | null; // The player who cast the ability
}

export type PlayerEffectType = 
  | "ATTACK_SPEED"
  | "ARMY_GAIN_BUFF"
  | "HYPERINFLATION";

export interface PlayerEffect {
  type: PlayerEffectType;
  durationLeft: number | null; // Remaining time in seconds - null for permanent
  sourcePlayerId: string | null; // The player who cast the ability
}

export type PlayerId = string

export type BuildingType = "FORT" | "BARRACKS" | "HOUSE" | "LABORATORY" | "SIEGE_OUTPOST" | "HARBOR";

export type SiegeAttackType = "BOMBARD" | "PLAGUE_BOMB";
export type SpecialAttackDefinition = {
  cost: number;
  range: number;
  canTarget: (state: CoreGameState, casterId: PlayerId, tile: TileState) => boolean;
  execute: (state: CoreGameState, casterId: PlayerId, tile: TileState) => boolean;
};

export type PlayerStatus =
  | "LOBBY"     // connected, not queued
  | "QUEUED"    // clicked Play, waiting
  | "PLAYING"   // in active match
  | "ELIMINATED";

export interface Axial {
  q: number
  r: number
}

export interface NavalCaptureInfo {
  sourceHarborKey: string;
  waterTilesCrossed: number;
  path: string[];
}

export interface CaptureState {
  by: PlayerId;
  remaining: number; // fraction of completed capture, 0-1
  completeAt: number; // timestamp for Date.now()
  cost: number;
  naval?: NavalCaptureInfo;
}

export interface TileState {
  q: number
  r: number
  ownerId: PlayerId | null
  defense: number

  building: "HQ" | BuildingType | null
  
  terrain: TerrainType
  baseDefense: number

  defenseHeat: number
  lastDefendedAt: number

  capture: CaptureState | null;

  buildingAction: {
    building: BuildingType;
    readyAt: number; // timestamp for Date.now()
    actionType: "CONSTRUCTING" | "DEMOLISHING"
  } | null;

  effects: TileEffect[];
  specialBuilding: SpecialBuildingType | null;
}

export interface WaterBody {
  id: number;
  waterTiles: Set<string>; // All water hexes in this lake/ocean
  coastalLandTiles: Set<string>; // All land hexes touching this body of water
}

export interface WaterNetwork {
  waterBodies: WaterBody[];
  landToWaterBodies: Map<string, Set<number>>;
}

export interface PlayerState {
  id: PlayerId
  username: string | null
  color: string;
  skinId: string | null;
  status: PlayerStatus;
  gold: number
  army: number
  eliminated: boolean
  hqPos: Axial
  lastSeen: number
  isBot?: boolean

  buildings: {
    fort: number,
    barracks: number,
    house: number,
    laboratory: number,
    siege_outpost: number,
    harbor: number,
  }

  effects: PlayerEffect[]
}

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
}

export interface PlayerMatchStats {
  dbId: string;
  tilesCaptured: number;
  playersEliminated: number;
  goldSpent: number;
  armySpent: number;
  survivalTimeSeconds: number;
  placement: number;
}