import { loginWithGoogle, supabase } from "../../utils/db.js";
import { getOrCreateGuestName, escapeHtml } from "./helpers.js";
import { getLobbyRefs, lobbyRuntime } from "./state.js";
import { openSettingsModal } from "./settingsModal.js";

function openUsernameModal(currentUsername: string, onConfirm: (username: string) => void) {
  const existing = document.getElementById("lobby-username-modal-overlay");
  if (existing) {
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "lobby-username-modal-overlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(2, 6, 23, 0.72)";
  overlay.style.backdropFilter = "blur(2px)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.padding = "20px";
  overlay.style.zIndex = "120";

  overlay.innerHTML = `
    <div id="lobby-username-modal" style="width:min(100%, 380px); background:#0f172a; border:1px solid rgba(56, 189, 248, 0.28); border-radius:12px; box-shadow:0 20px 40px rgba(0,0,0,0.45); overflow:hidden;">
      <div style="padding:14px 16px; border-bottom:1px solid rgba(255,255,255,0.08); font:700 14px system-ui; letter-spacing:0.2px; color:#e2e8f0;">
        Change Username
      </div>
      <div style="padding:14px 16px 16px;">
        <label for="lobby-username-modal-input" style="display:block; margin-bottom:8px; color:#94a3b8; font:500 12px system-ui;">
          Enter new username (1-15 chars)
        </label>
        <input id="lobby-username-modal-input" maxlength="15" style="width:100%; box-sizing:border-box; border:1px solid rgba(148, 163, 184, 0.35); border-radius:8px; padding:9px 10px; background:#020617; color:#e2e8f0; font:600 13px system-ui; outline:none;" />
        <div id="lobby-username-modal-error" style="display:none; margin-top:8px; color:#f87171; font:500 12px system-ui;"></div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;">
          <button id="lobby-username-modal-cancel" style="border:1px solid rgba(148, 163, 184, 0.4); background:transparent; color:#cbd5e1; border-radius:8px; padding:7px 12px; font:600 12px system-ui; cursor:pointer;">
            Cancel
          </button>
          <button id="lobby-username-modal-save" style="border:none; background:#0ea5e9; color:white; border-radius:8px; padding:7px 12px; font:700 12px system-ui; cursor:pointer;">
            Save
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const input = overlay.querySelector("#lobby-username-modal-input") as HTMLInputElement;
  const errorEl = overlay.querySelector("#lobby-username-modal-error") as HTMLDivElement;
  const cancelBtn = overlay.querySelector("#lobby-username-modal-cancel") as HTMLButtonElement;
  const saveBtn = overlay.querySelector("#lobby-username-modal-save") as HTMLButtonElement;

  const closeModal = () => {
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
  };

  const setError = (message: string) => {
    if (message) {
      errorEl.textContent = message;
      errorEl.style.display = "block";
      input.style.borderColor = "rgba(248, 113, 113, 0.9)";
      return;
    }

    errorEl.textContent = "";
    errorEl.style.display = "none";
    input.style.borderColor = "rgba(148, 163, 184, 0.35)";
  };

  const submit = () => {
    const next = input.value.trim();
    if (next.length < 1 || next.length > 15) {
      setError("Username must be between 1 and 15 characters.");
      return;
    }

    closeModal();
    onConfirm(next);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  };

  input.value = currentUsername;
  input.focus();
  input.select();
  input.oninput = () => setError("");
  cancelBtn.onclick = closeModal;
  saveBtn.onclick = submit;
  overlay.onclick = (event) => {
    if (event.target === overlay) {
      closeModal();
    }
  };
  document.addEventListener("keydown", onKeyDown);
}

export async function setupAuthAndUsername(sendIntent?: (intent: any) => void) {
  const refs = getLobbyRefs();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  // If user exists and token is valid
  if (user && !userError) {
    let username = getOrCreateGuestName();

    try {
      const { data: profile } = await supabase
        .from("players")
        .select("username, coins, owned_skins")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.username) {
        username = profile.username;
      }

      if (typeof profile?.coins === "number") {
        lobbyRuntime.coins = profile.coins;
      }

      if (Array.isArray(profile?.owned_skins)) {
        lobbyRuntime.ownedSkins = new Set(profile.owned_skins);
      }
    } catch {
      console.warn("Failed to fetch username from database. Using random guest name.");
    }

    refs.inputEl.value = username;
    lobbyRuntime.isUserAuthenticated = true;
    refs.inputEl.disabled = true;
    refs.inputEl.style.opacity = "0.8";
    refs.inputEl.style.cursor = "default";

    const safeUsername = escapeHtml(username);

    refs.topBarAuthContainer.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px;">
        <span id="user-coins-display" style="color:#facc15; font:600 14px system-ui; display:flex; align-items:center; gap:4px;">
          ${lobbyRuntime.coins ?? 0} 🪙
        </span>
        <button id="user-menu-trigger" style="background:none; border:none; color:#38bdf8; font:600 14px system-ui; cursor:pointer; display:flex; align-items:center; gap:4px; padding:4px 8px;">
          ${safeUsername} ▾
        </button>
      </div>
      <div id="auth-dropdown" style="display:none; position:absolute; right:0; top:calc(100% + 8px); background:#1e293b; border:1px solid rgba(255,255,255,0.1); border-radius:6px; min-width:190px; box-shadow:0 4px 12px rgba(0,0,0,0.5); overflow:hidden;">
        <button id="change-username-btn" style="width:100%; text-align:left; background:none; border:none; color:#e2e8f0; font:500 13px system-ui; padding:10px 12px; cursor:pointer; transition:background 0.2s;">
          Change Username
        </button>
        <button id="settings-btn" style="width:100%; text-align:left; background:none; border:none; color:#e2e8f0; font:500 13px system-ui; padding:10px 12px; cursor:pointer; transition:background 0.2s;">
          Settings
        </button>
        <button id="logout-btn" style="width:100%; text-align:left; background:none; border:none; color:#ef4444; font:500 13px system-ui; padding:10px 12px; cursor:pointer; transition:background 0.2s;">
          Log Out
        </button>
      </div>
    `;

    const trigger = refs.topBarAuthContainer.querySelector("#user-menu-trigger") as HTMLButtonElement;
    const dropdown = refs.topBarAuthContainer.querySelector("#auth-dropdown") as HTMLDivElement;
    const changeUsernameBtn = refs.topBarAuthContainer.querySelector("#change-username-btn") as HTMLButtonElement;
    const settingsBtn = refs.topBarAuthContainer.querySelector("#settings-btn") as HTMLButtonElement;
    const logoutBtn = refs.topBarAuthContainer.querySelector("#logout-btn") as HTMLButtonElement;

    trigger.onclick = (e) => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
    };

    changeUsernameBtn.onmouseenter = () => {
      changeUsernameBtn.style.background = "rgba(255, 255, 255, 0.08)";
    };
    changeUsernameBtn.onmouseleave = () => {
      changeUsernameBtn.style.background = "none";
    };

    changeUsernameBtn.onclick = () => {
      if (!sendIntent) return;

      dropdown.style.display = "none";
      const current = refs.inputEl.value;
      openUsernameModal(current, (next) => {
        sendIntent({ type: "CHANGE_USERNAME", username: next });
      });
    };

    settingsBtn.onmouseenter = () => {
      settingsBtn.style.background = "rgba(255, 255, 255, 0.08)";
    };
    settingsBtn.onmouseleave = () => {
      settingsBtn.style.background = "none";
    };

    settingsBtn.onclick = () => {
      dropdown.style.display = "none";
      openSettingsModal();
    };

    logoutBtn.onmouseenter = () => {
      logoutBtn.style.background = "rgba(239, 68, 68, 0.1)";
    };
    logoutBtn.onmouseleave = () => {
      logoutBtn.style.background = "none";
    };

    logoutBtn.onclick = async () => {
      if (sendIntent) {
        sendIntent({ type: "LOGOUT" });
      }
      await supabase.auth.signOut();
      setupAuthAndUsername(sendIntent);
    };

    return;
  }

  // 2. FALLBACK: Unauthenticated state (Expired token, logged out, or no session)
  refs.inputEl.value = getOrCreateGuestName();
  lobbyRuntime.isUserAuthenticated = false;
  lobbyRuntime.coins = null;
  lobbyRuntime.ownedSkins = new Set();
  refs.inputEl.disabled = false;
  refs.inputEl.style.opacity = "1";
  refs.inputEl.style.cursor = "text";

  refs.topBarAuthContainer.innerHTML = `
    <button id="top-google-login"
      style="padding:6px 12px;border-radius:8px;border:none;background:#4285F4;color:white;cursor:pointer;font:600 13px system-ui;display:flex;align-items:center;gap:6px;transition: background 0.2s;">
      <svg width="14" height="14" viewBox="0 0 18 18" style="display:block;">
        <path fill="#FFF" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.91c1.7-1.56 2.69-3.86 2.69-6.6z" />
        <path fill="#FFF" d="M9 18c2.43 0 4.47-.8 5.96-2.2l-2.91-2.26c-.8.54-1.85.86-3.05.86-2.34 0-4.33-1.58-5.04-3.7H.94v2.33A9 9 0 0 0 9 18z" />
        <path fill="#FFF" d="M3.96 10.7a5.4 5.4 0 0 1 0-3.4V4.97H.94a9 9 0 0 0 0 8.06l3.02-2.33z" />
        <path fill="#FFF" d="M9 3.58c1.32 0 2.5.45 3.44 1.35L15 2.1A9 9 0 0 0 .94 4.97l3.02 2.33C4.67 5.16 6.66 3.58 9 3.58z" />
      </svg>
      Sign in with Google
    </button>
  `;

  const topGoogleBtn = refs.topBarAuthContainer.querySelector("#top-google-login") as HTMLButtonElement;
  topGoogleBtn.onclick = () => {
    loginWithGoogle();
  };
}

export function updateCoinsDisplay(coins: number) {
  lobbyRuntime.coins = coins;
  const el = document.getElementById("user-coins-display");
  if (el) {
    el.textContent = `${coins} 🪙`;
  }
}
