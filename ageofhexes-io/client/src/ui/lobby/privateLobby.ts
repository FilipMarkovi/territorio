import { escapeHtml, getPrivateMapLabel } from "./helpers.js";
import { getLobbyRefs, lobbyRuntime, scheduleLobbyUIUpdate } from "./state.js";
import type { PrivateLobbyUpdateMessage, PrivateViewMode } from "./types.js";

export function setPrivateView(view: PrivateViewMode, hideError: () => void) {
  const refs = getLobbyRefs();
  lobbyRuntime.currentPrivateView = view;
  hideError();

  refs.mainButtonsContainer.style.display = view === "MAIN" ? "flex" : "none";
  refs.createPrivateContainer.style.display = view === "CREATE_PRIVATE" ? "flex" : "none";
  refs.joinPrivateContainer.style.display = view === "JOIN_PRIVATE" ? "flex" : "none";
  refs.inPrivateLobbyContainer.style.display = view === "IN_PRIVATE_LOBBY" ? "flex" : "none";
  refs.inputEl.disabled = view === "IN_PRIVATE_LOBBY";
  scheduleLobbyUIUpdate();
}

export function handlePrivateLobbyUpdate(msg: PrivateLobbyUpdateMessage, hideError: () => void) {
  const refs = getLobbyRefs();
  setPrivateView("IN_PRIVATE_LOBBY", hideError);

  refs.roomCodeDisplay.textContent = msg.code;
  refs.privateSettingsDisplayEl.textContent = `Map: ${getPrivateMapLabel(msg.mapId)} | Bots: ${msg.fillWithBots ? "Auto-Fill" : "Manual"}`;

  refs.privatePlayerListEl.innerHTML = msg.players
    .map(
      (p) => `
      <li style="font:500 13px system-ui; background:rgba(255,255,255,0.05); padding:6px 10px; border-radius:6px; display:flex; align-items:center; justify-content:space-between;">
        <span>${escapeHtml(p.username)}</span>
      </li>
    `
    )
    .join("");

  if (msg.isHost !== undefined) {
    refs.startPrivateMatchBtn.style.display = msg.isHost ? "block" : "none";
  }
}
