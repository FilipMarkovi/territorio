export type PrivateViewMode = "MAIN" | "CREATE_PRIVATE" | "JOIN_PRIVATE" | "IN_PRIVATE_LOBBY";

export type LobbyTopTab = "LOBBY" | "LEADERBOARD" | "STORE" | "INVENTORY";

export type LeaderboardCategory = "wins" | "games_played" | "players_eliminated" | "tiles_captured";

export interface LeaderboardEntry {
  stat_type: LeaderboardCategory;
  username: string;
  score: number;
}

export interface PrivateLobbyUpdateMessage {
  roomId: string;
  code: string;
  connected: number;
  required: number;
  mapId: string;
  fillWithBots: boolean;
  players: Array<{ username: string }>;
  isHost?: boolean;
}
