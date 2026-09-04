import { DEFAULT_SKIN_ID, SKINS_CATALOG } from "../../../../shared/storeItems.js";
import { escapeHtml, getEquippedSkin, setEquippedSkin } from "./helpers.js";
import { getLobbyRefs, lobbyRuntime } from "./state.js";

export function renderInventory() {
  const refs = getLobbyRefs();

  if (!lobbyRuntime.isUserAuthenticated) {
    refs.inventoryListEl.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding: 28px; color: #94a3b8; font: 500 14px system-ui;">Sign in to view your inventory.</div>';
    return;
  }

  const equipped = getEquippedSkin();
  const ownedSkinIds = Object.keys(SKINS_CATALOG).filter((id) => id === DEFAULT_SKIN_ID || lobbyRuntime.ownedSkins.has(id));

  refs.inventoryListEl.innerHTML = ownedSkinIds
    .map((id) => {
      const item = SKINS_CATALOG[id as keyof typeof SKINS_CATALOG];
      const isEquipped = id === equipped;
      return `
      <button data-skin-id="${id}"
        style="aspect-ratio:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; padding:10px; background:rgba(255,255,255,0.05); border:1px solid ${isEquipped ? "#38bdf8" : "rgba(255,255,255,0.1)"}; border-radius:10px; cursor:pointer; color:white; font:600 12px system-ui; text-align:center;">
        <img src="/skin_previews/${id}_preview.png" alt="${escapeHtml(item.name)}" style="width:70%; aspect-ratio:1; object-fit:cover; border-radius:8px;" />
        <span>${escapeHtml(item.name)}</span>
        <span style="color:${isEquipped ? "#4ade80" : "#94a3b8"}; font-weight:700;">${isEquipped ? "Equipped" : "Equip"}</span>
      </button>
    `;
    })
    .join("");

  refs.inventoryListEl.querySelectorAll("button[data-skin-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const skinId = btn.getAttribute("data-skin-id");
      if (!skinId || skinId === getEquippedSkin()) return;
      setEquippedSkin(skinId);
      renderInventory();
    });
  });
}
