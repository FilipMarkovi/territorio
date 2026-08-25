
import type { CoreGameState, BuildingType, PlayerEffectType, SiegeAttackType, PlayerMatchStats } from "../../../shared/index.js";

export const clientUIState = {
  selectedBuilding: null as BuildingType | null,
  selectedAbility: null as PlayerEffectType | null,
  selectedSpecialAttack: null as SiegeAttackType | null,
  phase: "LOBBY" as "LOBBY" | "QUEUED" | "PLAYING" | "GAME_OVER",
  username: "",
};

export const clientNetState = {
  playerId: null as string | null,
  state: null as CoreGameState | null,
  lobby: { connected: 0, required: 0, roomId: null as string | null, matchStartAt: null as number | null },
  roomId: null as string | null,
  privateRoomCode: null as string | null,
  serverClockOffset: 0,
  isReturningToLobby: false,
  latencyMs: null as number | null,
  matchStats: null as PlayerMatchStats | null,
};
