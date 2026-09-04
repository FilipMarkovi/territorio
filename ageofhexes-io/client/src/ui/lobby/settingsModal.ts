import { loadSettings, updateSettings, DEFAULT_KEYBINDS, DEFAULT_FPS, type Keybinds } from "../../input/settings.js";

const KEYBIND_LABELS: Array<{ key: keyof Keybinds; label: string }> = [
  { key: "buildFort", label: "Build Fort" },
  { key: "buildBarracks", label: "Build Barracks" },
  { key: "buildHouse", label: "Build House" },
  { key: "buildLaboratory", label: "Build Laboratory" },
  { key: "buildHarbor", label: "Build Harbor" },
  { key: "buildSiegeOutpost", label: "Build Siege Outpost" },
  { key: "useAttackSpeedAbility", label: "Blitz Attacks" },
  { key: "useArmyGainBuffAbility", label: "Overclock" },
  { key: "useHyperinflationAbility", label: "Hyperinflation" },
  { key: "useBombardSiegeAttack", label: "Bombard Siege Attack" },
  { key: "usePlagueBombSiegeAttack", label: "Plague Bomb Siege Attack" },
];

export function openSettingsModal() {
  if (document.getElementById("settings-modal-overlay")) return;

  const settings = loadSettings();
  const keybinds: Keybinds = { ...settings.keybinds };
  let fpsLimit = settings.fpsLimit;

  const overlay = document.createElement("div");
  overlay.id = "settings-modal-overlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(2, 6, 23, 0.72)";
  overlay.style.backdropFilter = "blur(2px)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.padding = "20px";
  overlay.style.zIndex = "130";

  overlay.innerHTML = `
    <div style="width:min(100%, 420px); max-height:calc(100vh - 40px); overflow-y:auto; background:#0f172a; border:1px solid rgba(56, 189, 248, 0.28); border-radius:12px; box-shadow:0 20px 40px rgba(0,0,0,0.45);">
      <div style="padding:14px 16px; border-bottom:1px solid rgba(255,255,255,0.08); font:700 14px system-ui; color:#e2e8f0;">
        Settings
      </div>
      <div style="padding:14px 16px 16px; display:flex; flex-direction:column; gap:10px;">
        <div style="font:600 12px system-ui; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px;">Keybinds</div>
        ${KEYBIND_LABELS.map(({ key, label }) => `
          <label style="display:flex; align-items:center; justify-content:space-between; gap:8px; font:500 13px system-ui; color:#cbd5e1;">
            ${label}
            <input data-keybind="${key}" readonly value="${keybinds[key].toUpperCase()}"
              style="width:64px; padding:6px 8px; border-radius:6px; border:1px solid rgba(148, 163, 184, 0.35); background:#020617; color:#e2e8f0; text-align:center; font:700 12px system-ui; cursor:pointer;" />
          </label>
        `).join("")}

        <div style="font:600 12px system-ui; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; margin-top:6px;">Performance</div>
        <label style="display:flex; align-items:center; justify-content:space-between; gap:8px; font:500 13px system-ui; color:#cbd5e1;">
          FPS Limit
          <input id="settings-fps-input" type="number" min="10" max="240" value="${fpsLimit}"
            style="width:64px; padding:6px 8px; border-radius:6px; border:1px solid rgba(148, 163, 184, 0.35); background:#020617; color:#e2e8f0; text-align:center; font:700 12px system-ui;" />
        </label>

        <div id="settings-modal-error" style="display:none; color:#f87171; font:500 12px system-ui;"></div>

        <div style="display:flex; justify-content:space-between; gap:8px; margin-top:10px;">
          <button id="settings-modal-reset" style="border:1px solid rgba(148, 163, 184, 0.4); background:transparent; color:#cbd5e1; border-radius:8px; padding:7px 12px; font:600 12px system-ui; cursor:pointer;">
            Reset to Default
          </button>
          <div style="display:flex; gap:8px;">
            <button id="settings-modal-cancel" style="border:1px solid rgba(148, 163, 184, 0.4); background:transparent; color:#cbd5e1; border-radius:8px; padding:7px 12px; font:600 12px system-ui; cursor:pointer;">
              Cancel
            </button>
            <button id="settings-modal-save" style="border:none; background:#0ea5e9; color:white; border-radius:8px; padding:7px 12px; font:700 12px system-ui; cursor:pointer;">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const errorEl = overlay.querySelector("#settings-modal-error") as HTMLDivElement;
  const fpsInput = overlay.querySelector("#settings-fps-input") as HTMLInputElement;
  const keybindInputs = Array.from(overlay.querySelectorAll("input[data-keybind]")) as HTMLInputElement[];

  const setError = (message: string) => {
    errorEl.textContent = message;
    errorEl.style.display = message ? "block" : "none";
  };

  const closeModal = () => {
    document.removeEventListener("keydown", onGlobalKeyDown, true);
    overlay.remove();
  };

  let listeningInput: HTMLInputElement | null = null;

  const startListening = (input: HTMLInputElement) => {
    keybindInputs.forEach((i) => (i.style.borderColor = "rgba(148, 163, 184, 0.35)"));
    listeningInput = input;
    input.style.borderColor = "rgba(56, 189, 248, 0.9)";
    input.value = "...";
  };

  keybindInputs.forEach((input) => {
    input.onclick = () => startListening(input);
  });

  const onGlobalKeyDown = (event: KeyboardEvent) => {
    if (!listeningInput) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
      }
      return;
    }

    event.preventDefault();
    if (event.key === "Escape") {
      const bindKey = listeningInput.getAttribute("data-keybind") as keyof Keybinds;
      listeningInput.value = keybinds[bindKey].toUpperCase();
      listeningInput.style.borderColor = "rgba(148, 163, 184, 0.35)";
      listeningInput = null;
      return;
    }

    const newKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const bindKey = listeningInput.getAttribute("data-keybind") as keyof Keybinds;
    keybinds[bindKey] = newKey;
    listeningInput.value = newKey.toUpperCase();
    listeningInput.style.borderColor = "rgba(148, 163, 184, 0.35)";
    listeningInput = null;
    setError("");
  };

  document.addEventListener("keydown", onGlobalKeyDown, true);

  overlay.querySelector("#settings-modal-reset")!.addEventListener("click", () => {
    Object.assign(keybinds, DEFAULT_KEYBINDS);
    keybindInputs.forEach((input) => {
      const bindKey = input.getAttribute("data-keybind") as keyof Keybinds;
      input.value = keybinds[bindKey].toUpperCase();
    });
    fpsInput.value = `${DEFAULT_FPS}`;
    setError("");
  });

  overlay.querySelector("#settings-modal-cancel")!.addEventListener("click", closeModal);

  overlay.querySelector("#settings-modal-save")!.addEventListener("click", () => {
    const parsedFps = parseInt(fpsInput.value, 10);
    if (isNaN(parsedFps) || parsedFps < 10 || parsedFps > 240) {
      setError("FPS limit must be between 10 and 240.");
      return;
    }

    const usedKeys = new Set<string>();
    for (const value of Object.values(keybinds)) {
      const lower = value.toLowerCase();
      if (usedKeys.has(lower)) {
        setError("Keybinds must be unique.");
        return;
      }
      usedKeys.add(lower);
    }

    fpsLimit = parsedFps;
    updateSettings({ keybinds, fpsLimit });
    closeModal();
  });

  overlay.onclick = (event) => {
    if (event.target === overlay) closeModal();
  };
}
