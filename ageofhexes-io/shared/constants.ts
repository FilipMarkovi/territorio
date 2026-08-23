import { BuildingType, SpecialBuildingType } from "./gameTypes";

const GOLD_SCALE = 1;

// World (client render)
export const MAP_RADIUS = 5;
export const HEX_SIZE = 30;
export const FILL_ALPHA = 0.5;

export const COLORS = {
  NEUTRAL: "#333",
  OWNED: "#2ecc71",
  OWNED_DEFENDED: "#27ae60",
  ENEMY_DEFENDED: "#444",
  HOVER_OK: "#6b7cff",
  HOVER_BAD: "#a33"
};

export const USERNAME_STORAGE_KEY = 'ageofhexes_guest_username';

// Player Effects
export const EFFECT_COSTS = {
  ATTACK_SPEED: 30 * GOLD_SCALE,
  ARMY_GAIN_BUFF: 40 * GOLD_SCALE,
  HYPERINFLATION: 40 * GOLD_SCALE,
};

export const EFFECT_DURATIONS = {
  ATTACK_SPEED: 30_000,
  ARMY_GAIN_BUFF: 30_000,
  HYPERINFLATION: 35_000,
};

export const EFFECT_STRENGTHS = {
  ATTACK_SPEED: 1.5,
  ARMY_GAIN_BUFF: 2.0,
  HYPERINFLATION: 1.5,
};

export const SPECIAL_ATTACK_COSTS = {
  BOMBARD: 45 * GOLD_SCALE,
  PLAGUE_BOMB: 40 * GOLD_SCALE,
} as const;

export const SPECIAL_ATTACK_RANGES = {
  BOMBARD: 6,
  PLAGUE_BOMB: 6,
} as const;

export const SPECIAL_ATTACK_TRAVEL_TIME_PER_TILE_MS = 250;

export const PLAGUE_SPREAD_INTERVAL_MS = 6_000;
export const PLAGUE_RADIUS = 3;
export const PLAGUE_DEFENSE_BONUS = 1;
export const PLAGUE_SOURCE_DEFENSE_BONUS = 2;

// Tile Effects
export const REINFORCED_DEFENSE_BONUS = 2;

// Conflict
export const BASE_CAPTURE_COST = 5;
export const CAPTURE_RATE = 1;
export const DEFEND_COST_RATIO = 0.8;

export const DEFENSE_HEAT_MAX = 3;
export const DEFENSE_HEAT_DECAY_MS = 10_000;
export const DEFENSE_COST_INCREMENT = 0.2;

export const TILE_ATTACK_COOLDOWN = 1_000;

export const TILES_UNTIL_MAX_ATTACKTIME_INCREASE = 50;
export const MAX_ATTACKTIME_INCREASE = 1;

// Economy
export const STARTING_GOLD = 15 * GOLD_SCALE;
export const STARTING_ARMY = 15;

export const BUILDING_COST = {
  BARRACKS: 30 * GOLD_SCALE,
  FORT: 25 * GOLD_SCALE,
  HOUSE: 20 * GOLD_SCALE,
  LABORATORY: 40 * GOLD_SCALE,
  SIEGE_OUTPOST: 35 * GOLD_SCALE,
  HARBOR: 40 * GOLD_SCALE,
} as const;

export const BUILDING_LIMIT = {
  BARRACKS: 2,
  FORT: 4,
  HOUSE: 8,
  LABORATORY: 1,
  SIEGE_OUTPOST: 3,
  HARBOR: 2,
} as const;

export const BUILDING_CONSTRUCTION_TIME = {
  BARRACKS: 8,
  FORT: 5,
  HOUSE: 3,
  LABORATORY: 10,
  SIEGE_OUTPOST: 12,
  HARBOR: 10,
} as const;

export const BUILDING_DEMOLISH_TIME = {
  BARRACKS: 10,
  FORT: 8,
  HOUSE: 5,
  LABORATORY: 12,
  SIEGE_OUTPOST: 14,
  HARBOR: 12,
} as const;

export const BUILDING_SIZE_MULTIPLIERS = new Map<BuildingType | "HQ" | SpecialBuildingType, number>([
  ["HOUSE", 1],
  ["BARRACKS", 1],
  ["FORT", 1],
  ["LABORATORY", 1.2],
  ["SIEGE_OUTPOST", 1],
  ["HARBOR", 1],
  ["HQ", 1.2],
  ["PLAGUE_SOURCE", 1.0]
]);

export const DEMOLISH_REFUND_RATIO = 0.5;

export const ARMY_CAP_PER_TILE = 1;
export const BASE_ARMY_MAX = 40;
export const BASE_GOLD_MAX = 100 * GOLD_SCALE;

export const GOLD_PER_TILE = 0.02 * GOLD_SCALE; // max gain at 50 tiles
export const ARMY_PER_TILE = 0.02; // max gain at 50 tiles

export const GOLD_TILE_CAP = 1 * GOLD_SCALE; // Maximum bonus gold gain per second for # of tiles owned
export const ARMY_TILE_CAP = 1; // Maximum bonus army gain per second for # of tiles owned

export const GOLD_PASSIVE = 0.5 * GOLD_SCALE;
export const ARMY_PASSIVE = 1;

export const NEUTRAL_TILE_CAPTURE_GOLD = 1 * GOLD_SCALE;
export const PLAYER_KILL_GOLD_REWARD = 20 * GOLD_SCALE;
export const TERRITORY_WIN_PERCENT = 70;

export const ARMY_PEAK = 0.6;
export const GOLD_PEAK = 0.4;

// Building effects
export const BASE_TILE_DEFENSE = 1;
export const HQ_DEFENSE_SELF = 3;
export const HQ_DEFENSE_ADJACENT = 2;
export const FORT_DEFENSE_SELF = 2;
export const FORT_DEFENSE_ADJACENT = 1;
export const BARRACKS_ARMY_BONUS = 0.5;
export const HOUSE_ARMY_CAP_BONUS = 10;
export const HARBOR_ATTACK_TIME_INCREASE = 500; // ms added to attack time for each tile crossed over water when attacking from a harbor

// System
export const PING_TIMEOUT = 10_000;
export const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 }
] as const;

export const ROOM_CODE_LENGTH = 6;
export const TICK_RATE = 100;

// Private rooms
export const MIN_PRIVATE_ROOM_PLAYERS = 2;
export const MAX_PRIVATE_ROOM_PLAYERS = 16;

export const MIN_HQ_DISTANCE = 3;