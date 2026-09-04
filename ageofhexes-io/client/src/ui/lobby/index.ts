import { ROOM_CODE_LENGTH, MIN_PRIVATE_ROOM_PLAYERS, MAX_PRIVATE_ROOM_PLAYERS, TERRITORY_WIN_PERCENT } from "../../../../shared/constants.js";
import { clientNetState, clientUIState } from "../../state/clientState.js";
import { PRIVATE_MAP_OPTIONS } from "./constants.js";
import { setupAuthAndUsername } from "./auth.js";
import { fetchLeaderboard } from "./leaderboard.js";
import { renderStore } from "./store.js";
import { renderInventory } from "./inventory.js";
import { getLobbyRefs, lobbyRuntime, scheduleLobbyUIUpdate, setBuySkinHandler, setLobbyRefs, setLobbyUIRefreshHandler } from "./state.js";
import { handlePrivateLobbyUpdate as handlePrivateLobbyUpdateInternal, setPrivateView } from "./privateLobby.js";
import { handleRouteChange, handleTopTabNavigation, initLobbyRouting, maybeJoinPrivateRoute, setLobbyTopTab, syncRouteFromState } from "./routes.js";
import type { LeaderboardCategory, PrivateLobbyUpdateMessage } from "./types.js";
import { setGuestName, getEquippedSkin } from "./helpers.js";
import { USERNAME_STORAGE_KEY } from "../../../../shared/index.js";
import type { PlayerMatchStats } from "../../../../shared/index.js";
import { getServerNow } from "../../utils/time.js";
import { SERVER_OPTIONS, getSelectedServerId, setSelectedServerId } from "../../constants/servers.js";
import { initLobbyHexBackground, setLobbyHexBackgroundVisible } from "./hexBackground.js";

let notificationTimer: number | null = null;
let lobbyCountdownIntervalId: number | null = null;

function formatLobbyCountdown(targetServerTimeMs: number): string {
  const serverNow = getServerNow();
  const remainingMs = Math.max(0, targetServerTimeMs - serverNow);
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getValidMatchStartAt(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function createIntroLoadingScreen() {
  const loadingScreenRoot = document.createElement("div");
  loadingScreenRoot.style.position = "absolute";
  loadingScreenRoot.style.inset = "0";
  loadingScreenRoot.style.background = "#000000";
  loadingScreenRoot.style.color = "white";
  loadingScreenRoot.style.display = "flex";
  loadingScreenRoot.style.alignItems = "center";
  loadingScreenRoot.style.justifyContent = "center";
  loadingScreenRoot.style.zIndex = "100";
  loadingScreenRoot.style.transition = "opacity 1.0s ease";
  loadingScreenRoot.style.opacity = "1";

  loadingScreenRoot.innerHTML = '<div style="font:700 64px system-ui; letter-spacing: 2px; text-transform: uppercase;">Age of Hexes</div>';
  document.body.appendChild(loadingScreenRoot);

  setTimeout(() => {
    loadingScreenRoot.style.opacity = "0";
    setTimeout(() => {
      loadingScreenRoot.remove();
    }, 1000);
  }, 1000);
}

function createLobbyMarkup(): string {
  return `
    <div id="lobby-screen" style="display:flex; flex-direction:column; align-items:center; gap:12px; width:min(340px, calc(100vw - 32px));">
      <div style="font:700 36px system-ui; margin-bottom: 4px; text-align:center;">Play Age of Hexes</div>

      <input id="name"
        placeholder="username"
        style="padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:#0f172a;color:white;min-width:260px;text-align:center;font-weight:600; width:100%; max-width:320px; box-sizing:border-box;" />

      <div id="main-lobby-view" style="display:flex; flex-direction:column; gap:8px; width:100%; max-width:320px;">
        <button id="play"
          style="padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:#2563eb;color:white;cursor:pointer;width:100%;font-weight:600;font-size:15px;">
          Quick Play
        </button>

        <div style="display:flex; gap:8px;">
          <button id="btn-show-create"
            style="flex:1; padding:8px; border-radius:8px; border:1px solid rgba(255,255,255,0.2); background:#1e293b; color:white; cursor:pointer; font-weight:600; font-size:12px;">
            Host Room
          </button>
          <button id="btn-show-join"
            style="flex:1; padding:8px; border-radius:8px; border:1px solid rgba(255,255,255,0.2); background:#1e293b; color:white; cursor:pointer; font-weight:600; font-size:12px;">
            Join Code
          </button>
        </div>
      </div>

      <div id="create-private-view" style="display:none; flex-direction:column; gap:10px; width:100%; max-width:320px; background:#0f172a; padding:16px; border-radius:12px; border:1px solid rgba(255,255,255,0.1); box-sizing:border-box;">
      <div style="font:600 16px system-ui; text-align:center;">Host Private Room</div>

      <label style="display:flex; align-items:center; justify-content:space-between; font:13px system-ui; color:#cbd5e1; gap:8px;">
        Map:
        <select id="select-private-map"
          style="flex:1; min-width:0; padding:6px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.2); background:#1e293b; color:white; font-weight:600;">
          ${PRIVATE_MAP_OPTIONS.map((opt) => `<option value="${opt.id}">${opt.label}</option>`).join("")}
        </select>
      </label>

      <label style="display:flex; align-items:center; justify-content:space-between; font:13px system-ui; color:#cbd5e1;">
        Max Players (${MIN_PRIVATE_ROOM_PLAYERS}-${MAX_PRIVATE_ROOM_PLAYERS}):
        <input type="number" id="input-max-players" value="4" min="${MIN_PRIVATE_ROOM_PLAYERS}" max="${MAX_PRIVATE_ROOM_PLAYERS}"
          style="width:50px; padding:4px 6px; border-radius:6px; border:1px solid rgba(255,255,255,0.2); background:#1e293b; color:white; text-align:center; font-weight:600;" />
      </label>

      <label style="display:flex; align-items:center; gap:8px; font:13px system-ui; cursor:pointer;">
        <input type="checkbox" id="chk-fill-bots" checked style="cursor:pointer;" />
        Fill empty slots with bots
      </label>

      <button id="btn-confirm-create"
        style="padding:9px; border-radius:8px; border:none; background:#16a34a; color:white; cursor:pointer; font-weight:600; font-size:13px;">
        Create Room
      </button>
      <button id="btn-cancel-create"
        style="padding:6px; border-radius:8px; border:none; background:transparent; color:#94a3b8; cursor:pointer; font:12px system-ui;">
        Cancel
      </button>
      </div>

      <div id="join-private-view" style="display:none; flex-direction:column; gap:10px; width:100%; max-width:320px; background:#0f172a; padding:16px; border-radius:12px; border:1px solid rgba(255,255,255,0.1); box-sizing:border-box;">
      <div style="font:600 16px system-ui; text-align:center;">Join Private Room</div>

      <input id="input-room-code"
        placeholder="${ROOM_CODE_LENGTH}-LETTER CODE"
        maxlength="${ROOM_CODE_LENGTH}"
        style="padding:8px; border-radius:8px; border:1px solid rgba(255,255,255,0.2); background:#1e293b; color:white; text-align:center; font:700 16px monospace; text-transform:uppercase; letter-spacing:2px;" />

      <button id="btn-confirm-join"
        style="padding:9px; border-radius:8px; border:none; background:#2563eb; color:white; cursor:pointer; font-weight:600; font-size:13px;">
        Join Room
      </button>
      <button id="btn-cancel-join"
        style="padding:6px; border-radius:8px; border:none; background:transparent; color:#94a3b8; cursor:pointer; font:12px system-ui;">
        Cancel
      </button>
      </div>

      <div id="in-private-view" style="display:none; flex-direction:column; gap:12px; width:100%; max-width:340px; background:#0f172a; padding:16px; border-radius:12px; border:1px solid rgba(255,255,255,0.1); box-sizing:border-box;">
      <div style="text-align:center;">
        <div style="font:500 12px system-ui; color:#94a3b8; letter-spacing:1px; text-transform:uppercase;">Room Code</div>
        <div style="display:flex; align-items:center; justify-content:center; gap:8px; margin-top:2px;">
          <h2 id="display-room-code" style="font:700 24px monospace; letter-spacing:3px; margin:0; color:#38bdf8;">${"-".repeat(ROOM_CODE_LENGTH)}</h2>
          <button id="btn-copy-code" title="Copy Code" style="background:rgba(255,255,255,0.1); border:none; border-radius:6px; color:white; padding:4px 8px; cursor:pointer;">📋</button>
        </div>
      </div>

      <div id="private-settings-display" style="font:12px system-ui; color:#cbd5e1; background:rgba(255,255,255,0.05); padding:8px 10px; border-radius:6px; text-align:center;">
        Bots: Auto-Fill
      </div>

      <div style="width:100%;">
        <div style="font:600 13px system-ui; color:#94a3b8; margin-bottom:6px;">Players</div>
        <ul id="private-player-list" style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px; max-height:120px; overflow-y:auto;"></ul>
      </div>

      <button id="btn-start-private-match"
        style="padding:10px; border-radius:8px; border:none; background:#16a34a; color:white; cursor:pointer; font-weight:600; font-size:14px; display:none;">
        Start Game
      </button>

      <button id="btn-leave-private"
        style="padding:8px; border-radius:8px; border:1px solid rgba(239, 68, 68, 0.4); background:rgba(239, 68, 68, 0.1); color:#fca5a5; cursor:pointer; font-weight:600; font-size:12px;">
        Leave Room
      </button>
      </div>

      <div id="private-error-msg" style="color:#f87171; font:12px system-ui; display:none; text-align:center; max-width:260px;"></div>
      <div id="status" style="opacity:0.9;font:14px system-ui;margin-top:4px; text-align:center;"></div>
    </div>

    <div id="leaderboard-screen" style="display:none; flex-direction:column; gap:12px; width:min(560px, calc(100vw - 32px)); background:#0f172a; padding:18px; border-radius:16px; border:1px solid rgba(255,255,255,0.1); box-sizing:border-box; box-shadow:0 18px 40px rgba(0,0,0,0.32);">
      <div style="font:700 24px system-ui; text-align:center; color:#38bdf8;">Leaderboard</div>

      <div id="leaderboard-view" style="display:flex; flex-direction:column; gap:10px; width:100%;">
        <div id="leaderboard-tabs" style="display:flex; gap:6px; justify-content: space-between; background: rgba(255,255,255,0.05); padding: 6px; border-radius: 10px;">
          <button data-cat="wins" title="Wins" style="flex:1; padding:8px 6px; border:none; border-radius:8px; background:#2563eb; color:white; cursor:pointer; font:600 12px system-ui;">Wins</button>
          <button data-cat="games_played" title="Games Played" style="flex:1; padding:8px 6px; border:none; border-radius:8px; background:transparent; color:#94a3b8; cursor:pointer; font:600 12px system-ui;">Games Played</button>
          <button data-cat="players_eliminated" title="Players Eliminated" style="flex:1; padding:8px 6px; border:none; border-radius:8px; background:transparent; color:#94a3b8; cursor:pointer; font:600 12px system-ui;">Eliminations</button>
          <button data-cat="tiles_captured" title="Tiles Captured" style="flex:1; padding:8px 6px; border:none; border-radius:8px; background:transparent; color:#94a3b8; cursor:pointer; font:600 12px system-ui;">Tiles Captured</button>
        </div>

        <ul id="leaderboard-list" style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px; min-height: 320px;">
          <div style="text-align:center; padding: 28px; color: #94a3b8; font: 500 14px system-ui;">Loading...</div>
        </ul>
      </div>
    </div>

    <div id="store-screen" style="display:none; flex-direction:column; gap:12px; width:min(560px, calc(100vw - 32px)); background:#0f172a; padding:18px; border-radius:16px; border:1px solid rgba(255,255,255,0.1); box-sizing:border-box; box-shadow:0 18px 40px rgba(0,0,0,0.32);">
      <div style="font:700 24px system-ui; text-align:center; color:#38bdf8;">Store</div>
      <div id="store-list" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(110px, 1fr)); gap:10px; min-height: 320px;"></div>
    </div>

    <div id="inventory-screen" style="display:none; flex-direction:column; gap:12px; width:min(560px, calc(100vw - 32px)); background:#0f172a; padding:18px; border-radius:16px; border:1px solid rgba(255,255,255,0.1); box-sizing:border-box; box-shadow:0 18px 40px rgba(0,0,0,0.32);">
      <div style="font:700 24px system-ui; text-align:center; color:#38bdf8;">Inventory</div>
      <div id="inventory-list" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(110px, 1fr)); gap:10px; min-height: 320px;"></div>
    </div>
  `;
}

function getValidName(): string | null {
  const refs = getLobbyRefs();
  const name = refs.inputEl.value.trim();
  if (!name) {
    showError("Please enter a username.");
    return null;
  }
  return name;
}

export function showError(msg: string) {
  showNotice(msg, "error");
}

export function showSuccess(msg: string) {
  showNotice(msg, "success");
}

function showNotice(msg: string, tone: "error" | "success") {
  const refs = getLobbyRefs();
  const el = refs.notificationEl;

  if (notificationTimer !== null) {
    window.clearTimeout(notificationTimer);
    notificationTimer = null;
  }

  el.textContent = msg;
  el.style.display = "block";
  el.style.opacity = "1";

  if (tone === "error") {
    el.style.background = "rgba(127, 29, 29, 0.93)";
    el.style.borderColor = "rgba(248, 113, 113, 0.65)";
    el.style.color = "#fecaca";
  } else {
    el.style.background = "rgba(30, 64, 175, 0.93)";
    el.style.borderColor = "rgba(96, 165, 250, 0.75)";
    el.style.color = "#dbeafe";
  }

  notificationTimer = window.setTimeout(() => {
    el.style.opacity = "0";
    window.setTimeout(() => {
      el.style.display = "none";
    }, 220);
    notificationTimer = null;
  }, 5000);
}

export function hideError() {
  const refs = getLobbyRefs();
  if (notificationTimer !== null) {
    window.clearTimeout(notificationTimer);
    notificationTimer = null;
  }

  refs.notificationEl.style.display = "none";
  refs.notificationEl.style.opacity = "0";
  refs.notificationEl.textContent = "";
}

export function initLobbyUI(sendIntent: (intent: any) => void) {
  createIntroLoadingScreen();
  initLobbyHexBackground();

  const topBarRoot = document.createElement("div");
  topBarRoot.style.position = "absolute";
  topBarRoot.style.top = "0";
  topBarRoot.style.left = "0";
  topBarRoot.style.width = "100%";
  topBarRoot.style.height = "50px";
  topBarRoot.style.display = "flex";
  topBarRoot.style.alignItems = "center";
  topBarRoot.style.justifyContent = "space-between";
  topBarRoot.style.padding = "0 20px";
  topBarRoot.style.background = "rgba(15, 23, 42, 0.8)";
  topBarRoot.style.backdropFilter = "blur(8px)";
  topBarRoot.style.borderBottom = "1px solid rgba(255, 255, 255, 0.1)";
  topBarRoot.style.color = "white";
  topBarRoot.style.zIndex = "60";
  topBarRoot.style.boxSizing = "border-box";

  topBarRoot.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px;">
      <a href="https://www.ageofhexes.io" style="font:700 18px system-ui; letter-spacing: 0.5px; color:inherit; text-decoration:none; background:none; border:none; padding:0; margin:0; cursor:pointer; display:inline-block;">AgeOfHexes.io</a>
      <a href="https://discord.gg/u394JnfrjY" target="_blank" title="Join Discord" style="display:flex; align-items:center; padding:6px; border-radius:8px; background:rgba(255,255,255,0.05); color:white; text-decoration:none; transition: background 0.2s;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 11.74 11.74 0 0 0-.617-1.25.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.069.069 0 0 0-.032.027C.533 9.048-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"></path>
        </svg>
      </a>
    </div>
    <div style="position: absolute; left: 50%; transform: translateX(-50%); display:flex; align-items:center; justify-content:center; gap:6px; padding:4px; border-radius:10px; background:rgba(255,255,255,0.05);">
      <button id="top-tab-lobby" style="padding:7px 12px; border:none; border-radius:8px; background:rgba(37, 99, 235, 0.9); color:white; cursor:pointer; font:600 13px system-ui;">Lobby</button>
      <button id="top-tab-leaderboard" style="padding:7px 12px; border:none; border-radius:8px; background:transparent; color:#cbd5e1; cursor:pointer; font:600 13px system-ui;">Leaderboard</button>
      <button id="top-tab-store" style="padding:7px 12px; border:none; border-radius:8px; background:transparent; color:#cbd5e1; cursor:pointer; font:600 13px system-ui;">Store</button>
      <button id="top-tab-inventory" style="padding:7px 12px; border:none; border-radius:8px; background:transparent; color:#cbd5e1; cursor:pointer; font:600 13px system-ui;">Inventory</button>
    </div>
    <div id="top-bar-auth" style="position: relative;"></div>
  `;

  document.body.appendChild(topBarRoot);
  const topBarAuthContainer = topBarRoot.querySelector("#top-bar-auth") as HTMLDivElement;

  const serverSelectRoot = document.createElement("div");
  serverSelectRoot.style.position = "absolute";
  serverSelectRoot.style.top = "58px";
  serverSelectRoot.style.left = "20px";
  serverSelectRoot.style.zIndex = "60";
  serverSelectRoot.style.display = "flex";
  serverSelectRoot.style.alignItems = "center";
  serverSelectRoot.style.gap = "6px";
  serverSelectRoot.innerHTML = `
    <span style="font:600 12px system-ui; color:#94a3b8;">Server:</span>
    <select id="select-server"
      style="padding:5px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.2); background:#1e293b; color:white; font-weight:600; font-size:12px; cursor:pointer;">
      ${SERVER_OPTIONS.map((opt) => `<option value="${opt.id}">${opt.label}</option>`).join("")}
    </select>
  `;
  document.body.appendChild(serverSelectRoot);

  const notificationEl = document.createElement("div");
  notificationEl.style.position = "absolute";
  notificationEl.style.top = "58px";
  notificationEl.style.left = "50%";
  notificationEl.style.transform = "translateX(-50%)";
  notificationEl.style.maxWidth = "min(560px, calc(100vw - 24px))";
  notificationEl.style.padding = "9px 14px";
  notificationEl.style.borderRadius = "10px";
  notificationEl.style.border = "1px solid rgba(255,255,255,0.25)";
  notificationEl.style.font = "600 13px system-ui";
  notificationEl.style.letterSpacing = "0.2px";
  notificationEl.style.display = "none";
  notificationEl.style.opacity = "0";
  notificationEl.style.transition = "opacity 0.2s ease";
  notificationEl.style.boxShadow = "0 10px 28px rgba(0,0,0,0.45)";
  notificationEl.style.backdropFilter = "blur(6px)";
  notificationEl.style.textAlign = "center";
  notificationEl.style.pointerEvents = "none";
  notificationEl.style.zIndex = "70";
  document.body.appendChild(notificationEl);

  const lobbyRoot = document.createElement("div");
  lobbyRoot.style.position = "absolute";
  lobbyRoot.style.inset = "0";
  lobbyRoot.style.display = "flex";
  lobbyRoot.style.flexDirection = "column";
  lobbyRoot.style.alignItems = "center";
  lobbyRoot.style.justifyContent = "center";
  lobbyRoot.style.gap = "12px";
  lobbyRoot.style.background = "rgba(0,0,0,0.7)";
  lobbyRoot.style.color = "white";
  lobbyRoot.style.zIndex = "50";
  lobbyRoot.innerHTML = createLobbyMarkup();
  document.body.appendChild(lobbyRoot);

  const returnRoot = document.createElement("div");
  returnRoot.style.position = "absolute";
  returnRoot.style.left = "50%";
  returnRoot.style.top = "35%";
  returnRoot.style.transform = "translate(-50%, -50%)";
  returnRoot.style.zIndex = "40";
  returnRoot.style.display = "none";
  returnRoot.style.flexDirection = "column";
  returnRoot.style.alignItems = "center";
  returnRoot.style.gap = "18px";
  returnRoot.style.minWidth = "min(320px, calc(100vw - 32px))";
  returnRoot.style.maxWidth = "min(360px, calc(100vw - 32px))";
  returnRoot.style.padding = "22px 24px";
  returnRoot.style.borderRadius = "14px";
  returnRoot.style.background = "rgba(15, 23, 42, 0.72)";
  returnRoot.style.border = "1px solid rgba(255,255,255,0.15)";
  returnRoot.style.backdropFilter = "blur(6px)";
  returnRoot.style.boxShadow = "0 18px 44px rgba(0,0,0,0.5)";
  returnRoot.style.boxSizing = "border-box";

  const endResultTextEl = document.createElement("div");
  endResultTextEl.style.textAlign = "center";
  endResultTextEl.style.color = "#f8fafc";
  endResultTextEl.style.font = "800 28px system-ui";
  endResultTextEl.style.textShadow = "0 4px 16px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.6)";
  endResultTextEl.style.letterSpacing = "0.5px";

  const matchStatsListEl = document.createElement("div");
  matchStatsListEl.style.display = "flex";
  matchStatsListEl.style.flexDirection = "column";
  matchStatsListEl.style.gap = "6px";
  matchStatsListEl.style.width = "100%";
  matchStatsListEl.style.font = "500 13px system-ui";
  matchStatsListEl.style.color = "#e2e8f0";
  matchStatsListEl.style.background = "rgba(255,255,255,0.05)";
  matchStatsListEl.style.borderRadius = "10px";
  matchStatsListEl.style.padding = "10px 14px";

  const expandedButtonsRow = document.createElement("div");
  expandedButtonsRow.style.display = "flex";
  expandedButtonsRow.style.justifyContent = "space-between";
  expandedButtonsRow.style.width = "100%";
  expandedButtonsRow.style.gap = "10px";

  const returnButton = document.createElement("button");
  returnButton.textContent = "Return to Lobby";
  returnButton.style.flex = "1";
  returnButton.style.padding = "10px 14px";
  returnButton.style.borderRadius = "8px";
  returnButton.style.border = "1px solid rgba(255,255,255,0.2)";
  returnButton.style.background = "rgba(37, 99, 235, 0.85)";
  returnButton.style.color = "white";
  returnButton.style.font = "600 13px system-ui";
  returnButton.style.cursor = "pointer";

  const spectateBtn = document.createElement("button");
  spectateBtn.textContent = "Spectate";
  spectateBtn.style.flex = "1";
  spectateBtn.style.padding = "10px 14px";
  spectateBtn.style.borderRadius = "8px";
  spectateBtn.style.border = "1px solid rgba(255,255,255,0.2)";
  spectateBtn.style.background = "rgba(255,255,255,0.08)";
  spectateBtn.style.color = "white";
  spectateBtn.style.font = "600 13px system-ui";
  spectateBtn.style.cursor = "pointer";

  expandedButtonsRow.appendChild(returnButton);
  expandedButtonsRow.appendChild(spectateBtn);

  const expandedResultsSection = document.createElement("div");
  expandedResultsSection.style.display = "flex";
  expandedResultsSection.style.flexDirection = "column";
  expandedResultsSection.style.alignItems = "center";
  expandedResultsSection.style.gap = "18px";
  expandedResultsSection.style.width = "100%";
  expandedResultsSection.appendChild(endResultTextEl);
  expandedResultsSection.appendChild(matchStatsListEl);
  expandedResultsSection.appendChild(expandedButtonsRow);

  const collapsedButtonsRow = document.createElement("div");
  collapsedButtonsRow.style.display = "flex";
  collapsedButtonsRow.style.justifyContent = "space-between";
  collapsedButtonsRow.style.width = "100%";
  collapsedButtonsRow.style.gap = "10px";

  const collapsedReturnBtn = document.createElement("button");
  collapsedReturnBtn.textContent = "Return to Lobby";
  collapsedReturnBtn.style.flex = "1";
  collapsedReturnBtn.style.padding = "10px 14px";
  collapsedReturnBtn.style.borderRadius = "8px";
  collapsedReturnBtn.style.border = "1px solid rgba(255,255,255,0.2)";
  collapsedReturnBtn.style.background = "rgba(37, 99, 235, 0.85)";
  collapsedReturnBtn.style.color = "white";
  collapsedReturnBtn.style.font = "600 13px system-ui";
  collapsedReturnBtn.style.cursor = "pointer";

  const expandBtn = document.createElement("button");
  expandBtn.textContent = "Expand";
  expandBtn.style.flex = "1";
  expandBtn.style.padding = "10px 14px";
  expandBtn.style.borderRadius = "8px";
  expandBtn.style.border = "1px solid rgba(255,255,255,0.2)";
  expandBtn.style.background = "rgba(255,255,255,0.08)";
  expandBtn.style.color = "white";
  expandBtn.style.font = "600 13px system-ui";
  expandBtn.style.cursor = "pointer";

  collapsedButtonsRow.appendChild(collapsedReturnBtn);
  collapsedButtonsRow.appendChild(expandBtn);

  const collapsedResultsSection = document.createElement("div");
  collapsedResultsSection.style.display = "none";
  collapsedResultsSection.style.width = "100%";
  collapsedResultsSection.appendChild(collapsedButtonsRow);

  returnRoot.appendChild(expandedResultsSection);
  returnRoot.appendChild(collapsedResultsSection);
  document.body.appendChild(returnRoot);

  const refs = {
    topBarRoot,
    notificationEl,
    lobbyRoot,
    returnRoot,
    endResultTextEl,
    matchStatsListEl,
    expandedResultsSection,
    collapsedResultsSection,
    spectateBtn,
    expandBtn,
    collapsedReturnBtn,
    lobbyTabBtn: topBarRoot.querySelector("#top-tab-lobby") as HTMLButtonElement,
    leaderboardTabBtn: topBarRoot.querySelector("#top-tab-leaderboard") as HTMLButtonElement,
    storeTabBtn: topBarRoot.querySelector("#top-tab-store") as HTMLButtonElement,
    inventoryTabBtn: topBarRoot.querySelector("#top-tab-inventory") as HTMLButtonElement,
    lobbyScreenEl: lobbyRoot.querySelector("#lobby-screen") as HTMLDivElement,
    leaderboardScreenEl: lobbyRoot.querySelector("#leaderboard-screen") as HTMLDivElement,
    storeScreenEl: lobbyRoot.querySelector("#store-screen") as HTMLDivElement,
    storeListEl: lobbyRoot.querySelector("#store-list") as HTMLDivElement,
    inventoryScreenEl: lobbyRoot.querySelector("#inventory-screen") as HTMLDivElement,
    inventoryListEl: lobbyRoot.querySelector("#inventory-list") as HTMLDivElement,
    playBtn: lobbyRoot.querySelector("#play") as HTMLButtonElement,
    inputEl: lobbyRoot.querySelector("#name") as HTMLInputElement,
    statusEl: lobbyRoot.querySelector("#status") as HTMLDivElement,
    topBarAuthContainer,
    mainButtonsContainer: lobbyRoot.querySelector("#main-lobby-view") as HTMLDivElement,
    serverSelect: serverSelectRoot.querySelector("#select-server") as HTMLSelectElement,
    createPrivateContainer: lobbyRoot.querySelector("#create-private-view") as HTMLDivElement,
    joinPrivateContainer: lobbyRoot.querySelector("#join-private-view") as HTMLDivElement,
    inPrivateLobbyContainer: lobbyRoot.querySelector("#in-private-view") as HTMLDivElement,
    fillBotsCheckbox: lobbyRoot.querySelector("#chk-fill-bots") as HTMLInputElement,
    maxPlayersInput: lobbyRoot.querySelector("#input-max-players") as HTMLInputElement,
    privateMapSelect: lobbyRoot.querySelector("#select-private-map") as HTMLSelectElement,
    roomCodeInput: lobbyRoot.querySelector("#input-room-code") as HTMLInputElement,
    roomCodeDisplay: lobbyRoot.querySelector("#display-room-code") as HTMLHeadingElement,
    copyCodeBtn: lobbyRoot.querySelector("#btn-copy-code") as HTMLButtonElement,
    privatePlayerListEl: lobbyRoot.querySelector("#private-player-list") as HTMLUListElement,
    privateSettingsDisplayEl: lobbyRoot.querySelector("#private-settings-display") as HTMLDivElement,
    startPrivateMatchBtn: lobbyRoot.querySelector("#btn-start-private-match") as HTMLButtonElement,
    leaderboardContainer: lobbyRoot.querySelector("#leaderboard-view") as HTMLDivElement,
    leaderboardTabsEl: lobbyRoot.querySelector("#leaderboard-tabs") as HTMLDivElement,
    leaderboardListEl: lobbyRoot.querySelector("#leaderboard-list") as HTMLUListElement,
    serverSelectRoot
  };

  setLobbyRefs(refs);
  setLobbyUIRefreshHandler(() => updateLobbyUI());
  refs.inputEl.maxLength = 15;

  refs.serverSelect.value = getSelectedServerId();
  refs.serverSelect.onchange = () => {
    setSelectedServerId(refs.serverSelect.value);
    window.location.reload();
  };

  if (lobbyCountdownIntervalId !== null) {
    window.clearInterval(lobbyCountdownIntervalId);
  }
  lobbyCountdownIntervalId = window.setInterval(() => {
    const hasMatchStartTimer = getValidMatchStartAt(clientNetState.lobby.matchStartAt) !== null;
    const inLobbyPhase = clientUIState.phase === "LOBBY" || clientUIState.phase === "QUEUED";
    if (hasMatchStartTimer && inLobbyPhase) {
      scheduleLobbyUIUpdate();
    }
  }, 1000);

  initLobbyRouting({ sendIntent, hideError, showError });

  refs.lobbyTabBtn.onclick = () => handleTopTabNavigation("LOBBY", { sendIntent, hideError, showError });
  refs.leaderboardTabBtn.onclick = () => handleTopTabNavigation("LEADERBOARD", { sendIntent, hideError, showError });
  refs.storeTabBtn.onclick = () => handleTopTabNavigation("STORE", { sendIntent, hideError, showError });
  refs.inventoryTabBtn.onclick = () => handleTopTabNavigation("INVENTORY", { sendIntent, hideError, showError });

  setupAuthAndUsername(sendIntent).finally(() => {
    lobbyRuntime.isAuthResolved = true;
    maybeJoinPrivateRoute({ sendIntent, hideError, showError });
    scheduleLobbyUIUpdate();
  });
  fetchLeaderboard("wins");
  setBuySkinHandler((skinId) => sendIntent({ type: "BUY_SKIN", skinId }));
  renderStore();
  renderInventory();

  refs.leaderboardTabsEl.querySelectorAll("button").forEach((btn) => {
    btn.onclick = () => {
      const cat = btn.getAttribute("data-cat") as LeaderboardCategory;
      if (cat) fetchLeaderboard(cat);
    };
  });

  refs.playBtn.onclick = () => {
    if (clientUIState.phase === "QUEUED") {
      sendIntent({ type: "LEAVE_QUEUE" });
      clientUIState.phase = "LOBBY";
      setLobbyTopTab("LOBBY");
      refs.playBtn.disabled = false;
      refs.playBtn.style.opacity = "1";
      refs.playBtn.textContent = "Quick Play";
      refs.inputEl.disabled = lobbyRuntime.isUserAuthenticated;
      syncRouteFromState();
      scheduleLobbyUIUpdate();
      return;
    }

    const name = getValidName();
    if (!name) return;

    clientUIState.username = name;
    clientUIState.phase = "QUEUED";
    clientNetState.roomId = clientNetState.lobby.roomId;
    clientNetState.privateRoomCode = null;

    const savedName = localStorage.getItem(USERNAME_STORAGE_KEY);
    if (!savedName || savedName !== name) {
      setGuestName(name);
    }

    refs.inputEl.disabled = true;
    refs.playBtn.disabled = false;
    refs.playBtn.style.opacity = "1";
    refs.playBtn.textContent = "Cancel Queue";

    sendIntent({ type: "JOIN_QUEUE", username: name, skinId: getEquippedSkin() });
    syncRouteFromState();
    scheduleLobbyUIUpdate();
  };

  lobbyRoot.querySelector("#btn-show-create")?.addEventListener("click", () => setPrivateView("CREATE_PRIVATE", hideError));
  lobbyRoot.querySelector("#btn-show-join")?.addEventListener("click", () => setPrivateView("JOIN_PRIVATE", hideError));
  lobbyRoot.querySelector("#btn-cancel-create")?.addEventListener("click", () => {
    setPrivateView("MAIN", hideError);
    syncRouteFromState();
  });
  lobbyRoot.querySelector("#btn-cancel-join")?.addEventListener("click", () => {
    setPrivateView("MAIN", hideError);
    syncRouteFromState();
  });

  lobbyRoot.querySelector("#btn-confirm-create")?.addEventListener("click", () => {
    const name = getValidName();
    if (!name) return;

    const selectedMapId = refs.privateMapSelect.value;
    if (!PRIVATE_MAP_OPTIONS.some((opt) => opt.id === selectedMapId)) {
      showError("Please choose a valid map.");
      return;
    }

    let maxPlayers = parseInt(refs.maxPlayersInput.value, 10);
    if (isNaN(maxPlayers) || maxPlayers < MIN_PRIVATE_ROOM_PLAYERS) maxPlayers = MIN_PRIVATE_ROOM_PLAYERS;
    if (maxPlayers > MAX_PRIVATE_ROOM_PLAYERS) maxPlayers = MAX_PRIVATE_ROOM_PLAYERS;

    hideError();
    clientUIState.username = name;
    clientNetState.privateRoomCode = null;
    clientNetState.roomId = null;

    sendIntent({
      type: "CREATE_PRIVATE_ROOM",
      username: name,
      fillWithBots: refs.fillBotsCheckbox.checked,
      maxPlayers,
      mapId: selectedMapId,
      skinId: getEquippedSkin()
    });
  });

  lobbyRoot.querySelector("#btn-confirm-join")?.addEventListener("click", () => {
    const name = getValidName();
    const code = refs.roomCodeInput.value.trim().toUpperCase();

    if (!name) return;
    if (code.length !== ROOM_CODE_LENGTH) {
      showError(`Code must be ${ROOM_CODE_LENGTH} characters.`);
      return;
    }

    hideError();
    clientUIState.username = name;
    clientNetState.privateRoomCode = code;

    sendIntent({
      type: "JOIN_PRIVATE_ROOM",
      username: name,
      code
    });
  });

  refs.copyCodeBtn.onclick = () => {
    const code = refs.roomCodeDisplay.textContent;
    if (code && code !== "-".repeat(ROOM_CODE_LENGTH)) {
      navigator.clipboard.writeText(code);
      showSuccess("Room code copied.");
      refs.copyCodeBtn.textContent = "✅";
      setTimeout(() => {
        refs.copyCodeBtn.textContent = "📋";
      }, 1500);
    }
  };

  refs.startPrivateMatchBtn.onclick = () => {
    sendIntent({ type: "START_PRIVATE_MATCH" });
  };

  lobbyRoot.querySelector("#btn-leave-private")?.addEventListener("click", () => {
    sendIntent({ type: "LEAVE_PRIVATE_ROOM" });
    clientNetState.roomId = null;
    clientNetState.privateRoomCode = null;
    setPrivateView("MAIN", hideError);
    syncRouteFromState();
  });

  function returnToLobby() {
    clientNetState.isReturningToLobby = true;
    clientUIState.phase = "LOBBY";
    sendIntent({ type: "RETURN_LOBBY" });
    clientNetState.state = null;
    clientNetState.roomId = null;
    clientNetState.privateRoomCode = null;
    clientNetState.matchStats = null;
    clientUIState.selectedBuilding = null;
    clientUIState.selectedAbility = null;
    clientUIState.selectedSpecialAttack = null;
    setLobbyTopTab("LOBBY");
    setPrivateView("MAIN", hideError);
    refs.returnRoot.style.display = "none";
    lobbyRuntime.resultsCollapsed = false;
    syncRouteFromState();
    scheduleLobbyUIUpdate();
  }

  returnButton.onclick = returnToLobby;
  refs.collapsedReturnBtn.onclick = returnToLobby;

  refs.spectateBtn.onclick = () => {
    lobbyRuntime.resultsCollapsed = true;
    scheduleLobbyUIUpdate();
  };

  refs.expandBtn.onclick = () => {
    lobbyRuntime.resultsCollapsed = false;
    scheduleLobbyUIUpdate();
  };

  window.addEventListener("click", (e) => {
    const dropdown = document.getElementById("auth-dropdown");
    if (dropdown && !refs.topBarAuthContainer.contains(e.target as Node)) {
      dropdown.style.display = "none";
    }
  });

  scheduleLobbyUIUpdate();
}

export function updateLobbyUI() {
  const refs = getLobbyRefs();
  const state = clientNetState.state;
  const lobby = clientNetState.lobby;
  const meId = clientNetState.playerId;
  const me = meId ? state?.players.get(meId) : null;

  const showTopBar = clientUIState.phase === "LOBBY" || clientUIState.phase === "QUEUED";
  refs.topBarRoot.style.display = showTopBar ? "flex" : "none";
  refs.serverSelectRoot.style.display = showTopBar ? "flex" : "none";
  refs.playBtn.textContent = clientUIState.phase === "QUEUED" ? "Cancel Queue" : "Quick Play";

  const isLobby = clientUIState.phase === "LOBBY" || clientUIState.phase === "QUEUED";
  refs.lobbyRoot.style.display =
    !state?.gameOver && isLobby ? "flex" : "none";
  setLobbyHexBackgroundVisible(!state?.gameOver && isLobby);

  const footerinfo = document.getElementById("footer-info");
  if (footerinfo) {
    footerinfo.style.display = isLobby ? "block" : "none";
  }

  if (lobbyRuntime.currentTopTab === "STORE") {
    renderStore();
  }

  if (lobbyRuntime.currentTopTab === "INVENTORY") {
    renderInventory();
  }

  if (!lobby) {
    refs.statusEl.textContent = "Connecting...";
  } else if (lobbyRuntime.currentPrivateView !== "IN_PRIVATE_LOBBY") {
    const matchStartAt = getValidMatchStartAt(lobby.matchStartAt);
    const timerSuffix =
      matchStartAt !== null
        ? `Match starts in ${formatLobbyCountdown(matchStartAt)}`//` • Match starts in ${formatLobbyCountdown(matchStartAt)}`
        : "";

    if (clientUIState.phase === "QUEUED") {
      refs.statusEl.textContent = `${timerSuffix}`;//`Waiting for players: ${lobby.connected}/${lobby.required}${timerSuffix}`;
    } else {
      refs.statusEl.textContent = `${timerSuffix}`;//`Lobby: ${lobby.connected}/${lobby.required}${timerSuffix}`;
      refs.inputEl.disabled = lobbyRuntime.isUserAuthenticated;
      refs.playBtn.disabled = false;
      refs.playBtn.style.opacity = "1";
    }
    if (clientUIState.phase === "QUEUED") {
      refs.playBtn.disabled = false;
      refs.playBtn.style.opacity = "1";
    }
  } else {
    refs.statusEl.textContent = "";
  }

  const isGameOverPhase = clientUIState.phase === "GAME_OVER";
  const isGameOverState = !!state?.gameOver;
  const isEliminated = me?.eliminated === true;

  if (isGameOverPhase || isGameOverState || isEliminated) {
    if (isGameOverState && state?.gameOver && meId) {
      const winnerId = state.gameOver.winner;
      const winner = state.players.get(winnerId);
      let winnerName = "Unknown";
      if (winner && winner.username) {
        winnerName = winner.username;
      }
      const didWin = winnerId === meId;
      const winReason = state.gameOver.reason === "TERRITORY"
        ? `by owning ${TERRITORY_WIN_PERCENT}% of the territory`
        : "by elimination";
      refs.endResultTextEl.textContent = didWin
        ? `Victory! You won ${winReason}`
        : `Defeat - Winner: ${winnerName} won ${winReason}`;

      refs.endResultTextEl.style.color = didWin ? "#4ade80" : "#fca5a5";
    } else if (isEliminated) {
      refs.endResultTextEl.textContent = "You were eliminated";
      refs.endResultTextEl.style.color = "#fca5a5";
    } else {
      refs.endResultTextEl.textContent = "Match ended";
      refs.endResultTextEl.style.color = "#e2e8f0";
    }

    refs.returnRoot.style.display = "flex";
    renderMatchStats(refs.matchStatsListEl, clientNetState.matchStats);
    refs.expandedResultsSection.style.display = lobbyRuntime.resultsCollapsed ? "none" : "flex";
    refs.collapsedResultsSection.style.display = lobbyRuntime.resultsCollapsed ? "block" : "none";
  } else {
    refs.returnRoot.style.display = "none";
  }

  syncRouteFromState();
}

function formatSurvivalTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function renderMatchStats(container: HTMLDivElement, stats: PlayerMatchStats | null) {
  if (!stats) {
    container.innerHTML = "";
    container.style.display = "none";
    return;
  }

  container.style.display = "flex";
  const rows: Array<[string, string]> = [
    ["Placement", stats.placement > 0 ? `#${stats.placement}` : "-"],
    ["Tiles Captured", `${stats.tilesCaptured}`],
    ["Players Eliminated", `${stats.playersEliminated}`],
    ["Gold Spent", `${stats.goldSpent}`],
    ["Army Spent", `${stats.armySpent}`],
    ["Survival Time", formatSurvivalTime(stats.survivalTimeSeconds)],
  ];

  container.innerHTML = rows
    .map(([label, value]) => `
      <div style="display:flex; justify-content:space-between; gap:12px;">
        <span style="color:#94a3b8;">${label}</span>
        <span style="font-weight:600;">${value}</span>
      </div>
    `)
    .join("");
}

export function handlePrivateLobbyUpdate(msg: PrivateLobbyUpdateMessage) {
  clientNetState.roomId = msg.roomId;
  clientNetState.privateRoomCode = msg.code;
  lobbyRuntime.pendingPrivateJoin = null;
  handlePrivateLobbyUpdateInternal(msg, hideError);
  syncRouteFromState();
  scheduleLobbyUIUpdate();
}

export function handleLobbyRouteState(sendIntent: (intent: any) => void) {
  handleRouteChange({ sendIntent, hideError, showError });
}
