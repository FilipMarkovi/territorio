import { TerrainType } from "../../shared/index.js";

// Server-only world setup
export const TERRAIN_BASE_DEFENSE: Record<TerrainType, number> = {
  GRASS: 1,
  DESERT: 2,
  MOUNTAIN: 3,
  WATER: 999,
  BEDROCK: 999,
};

export const PLAYER_COLORS = [
  "#2338fa", // 1. Bright Royal Blue
  "#ff4949", // 2. Crimson Red //
  "#25dd68", // 3. Neon Emerald Green
  "#eab308", // 4. Vibrant Gold / Yellow
  "#a855f7", // 5. Deep Purple
  "#f97316", // 6. Bright Orange
  "#06b6d4", // 7. Electric Cyan / Light Blue
  "#ff49a4", // 8. Hot Pink
  "#568313", // 9. Lime Green
  "#871f97", // 10. Dark Magenta
  "#f0df4b", // 11. Bright Lemon Yellow
  "#a30000", // 12. Raspberry Red
  "#8be5f5", // 13. Indigo
  "#ff92f0", // 14. Bright Lemon Yellow
  "#1ea571", // 15. Sky Blue
  "#675dff", // 16. Pastel Apricot / Peach
  "#606063",
  "#d7d7d8",
  "#4d4d4e",
  "#524f7b",
  "#3f513c",
  "#56613e",
  "#6e6545",
  "#623e35",
];

export const MAX_INTENTS_PER_SECOND = 10;

// Coins
export const COINS_REWARD_WIN = 10;
export const COINS_REWARD_LOSS = 3;
export const MINIMUM_SURVIVAL_TIME_FOR_COINS = 90; // in seconds

// AI
export const PIVOT_DIST = 4;
export const STEEPNESS = 1.6;
export const TIME_TO_AI_AUTOFILL = 5_000;
export const DEFAULT_BOT_AGGRESSION = 40;

export const HQ_PLACEMENT_TIME_LIMIT = 15_000;

export const GAMER_NAMES: string[] = [
  "ShadowByte", "PixelKnight", "CyberMage", "NeonReaper", "VoidWalker",
  "AlphaZen", "RoguePulse", "IronGlimpse", "FrostWarden", "ZenithZero",
  "SolarFlare", "LunaStatic", "Stormv1per", "EchoSlayer", "TitanCore",
  "GlitchMaster", "RiftRunner", "NovaStrike", "CobaltRush", "AeroGhost",
  "VortexVandal", "HyperNova", "WildCard", "ApexPredator", "SilentScope",
  "FatalError", "GhostProtocol", "OmegaShift", "PrimalFury", "VectorVelocity",

  "MysticPanda", "GrimFable", "SleepySloth", "AngryBirdie", "DogeLord",
  "LofiVibes", "PizzaThief", "BobaFettuccine", "TacoTuesday", "CerealKiller",
  "DuckingGoose", "Marshmallowmmadness", "PoptartPower", "BubbleTeaBot", "SofaHero",
  "LaundryDay", "WiFiWarrior", "Buffered", "LowBattery", "LaggyLarry",
  "ButtonMasher", "JoystickJunkie", "RespawnRepeat", "NoobSlayer99", "LeetSpoke",

  "AbyssWatcher", "DoomSpiral", "NightCrawler", "SoulFragment", "BloodMoon",
  "HollowPoint", "CursedRelic", "ShadowPhaze", "WraithKing", "PhantomEdge",
  "NecroDancer", "DarkMatter", "EclipseEnd", "BoneCollector", "VenomSting",
  "ChaosTheory", "Oblivion", "GrimRevolt", "SkullBash", "TerrorByte",

  "CircuitBreaker", "DataStream", "BinaryBeast", "NeuralNetwork", "NanoBlade",
  "PlasmaPulse", "SiliconSoul", "MacroWave", "BitCrusher", "LogicGate",
  "KernelPanic", "SynapseSnap", "OverClocked", "Mainframe", "CyberDrone",
  "StaticShock", "Voltage", "GridRunner", "BitShifter", "FireWall",

  "MagmaMelt", "ArcticFox", "TerraForm", "CloudNine", "ThunderBolt",
  "DeepCurrent", "SolarWind", "AshFall", "QuakeMaker", "SkyBound",
  "WildFire", "FrostBite", "StoneCold", "MistWalker", "StarGazer"
];
