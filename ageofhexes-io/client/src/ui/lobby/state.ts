import type { LeaderboardCategory, LeaderboardEntry, LobbyTopTab, PrivateViewMode } from "./types.js";

export interface LobbyRefs {
  topBarRoot: HTMLDivElement;
  notificationEl: HTMLDivElement;
  lobbyRoot: HTMLDivElement;
  returnRoot: HTMLDivElement;
  endResultTextEl: HTMLDivElement;
  matchStatsListEl: HTMLDivElement;
  expandedResultsSection: HTMLDivElement;
  collapsedResultsSection: HTMLDivElement;
  spectateBtn: HTMLButtonElement;
  expandBtn: HTMLButtonElement;
  collapsedReturnBtn: HTMLButtonElement;
  lobbyTabBtn: HTMLButtonElement;
  leaderboardTabBtn: HTMLButtonElement;
  storeTabBtn: HTMLButtonElement;
  inventoryTabBtn: HTMLButtonElement;
  lobbyScreenEl: HTMLDivElement;
  leaderboardScreenEl: HTMLDivElement;
  storeScreenEl: HTMLDivElement;
  storeListEl: HTMLDivElement;
  inventoryScreenEl: HTMLDivElement;
  inventoryListEl: HTMLDivElement;
  playBtn: HTMLButtonElement;
  inputEl: HTMLInputElement;
  statusEl: HTMLDivElement;
  topBarAuthContainer: HTMLDivElement;
  mainButtonsContainer: HTMLDivElement;
  serverSelect: HTMLSelectElement;
  serverSelectRoot: HTMLDivElement;
  createPrivateContainer: HTMLDivElement;
  joinPrivateContainer: HTMLDivElement;
  inPrivateLobbyContainer: HTMLDivElement;
  fillBotsCheckbox: HTMLInputElement;
  maxPlayersInput: HTMLInputElement;
  privateMapSelect: HTMLSelectElement;
  roomCodeInput: HTMLInputElement;
  roomCodeDisplay: HTMLHeadingElement;
  copyCodeBtn: HTMLButtonElement;
  privatePlayerListEl: HTMLUListElement;
  privateSettingsDisplayEl: HTMLDivElement;
  startPrivateMatchBtn: HTMLButtonElement;
  leaderboardContainer: HTMLDivElement;
  leaderboardTabsEl: HTMLDivElement;
  leaderboardListEl: HTMLUListElement;
}

export const lobbyRuntime = {
  refs: null as LobbyRefs | null,
  isUserAuthenticated: false,
  isAuthResolved: false,
  coins: null as number | null,
  currentPrivateView: "MAIN" as PrivateViewMode,
  currentTopTab: "LOBBY" as LobbyTopTab,
  currentLeaderboardTab: "wins" as LeaderboardCategory,
  pendingPrivateJoin: null as { roomId: string | null; code: string } | null,
  attemptedPrivateJoinKey: null as string | null,
  leaderboardCache: new Map<LeaderboardCategory, { data: LeaderboardEntry[]; timestamp: number }>(),
  scheduledUiUpdate: false,
  uiRefreshHandler: null as (() => void) | null,
  resultsCollapsed: false,
  ownedSkins: new Set<string>(),
  buySkinHandler: null as ((skinId: string) => void) | null
};

export function setBuySkinHandler(handler: (skinId: string) => void) {
  lobbyRuntime.buySkinHandler = handler;
}

export function setLobbyRefs(refs: LobbyRefs) {
  lobbyRuntime.refs = refs;
}

export function getLobbyRefs(): LobbyRefs {
  if (!lobbyRuntime.refs) {
    throw new Error("Lobby UI has not been initialized yet.");
  }
  return lobbyRuntime.refs;
}

export function setLobbyUIRefreshHandler(handler: () => void) {
  lobbyRuntime.uiRefreshHandler = handler;
}

export function scheduleLobbyUIUpdate() {
  if (lobbyRuntime.scheduledUiUpdate || !lobbyRuntime.uiRefreshHandler) {
    return;
  }

  lobbyRuntime.scheduledUiUpdate = true;
  queueMicrotask(() => {
    lobbyRuntime.scheduledUiUpdate = false;
    lobbyRuntime.uiRefreshHandler?.();
  });
}
