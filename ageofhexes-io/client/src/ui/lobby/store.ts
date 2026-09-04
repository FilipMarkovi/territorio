import { SKINS_CATALOG } from "../../../../shared/storeItems.js";
import { escapeHtml } from "./helpers.js";
import { getLobbyRefs, lobbyRuntime } from "./state.js";

function openPurchaseConfirmation(itemName: string, price: number, onConfirm: () => void) {
  if (document.getElementById("store-purchase-confirmation-overlay")) {
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "store-purchase-confirmation-overlay";
  overlay.style.cssText = "position:fixed; inset:0; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(2,6,23,0.72); backdrop-filter:blur(2px); z-index:120;";
  overlay.innerHTML = `
    <div role="dialog" aria-modal="true" aria-labelledby="store-purchase-confirmation-message" style="width:min(100%,380px); padding:20px; background:#0f172a; border:1px solid rgba(56,189,248,0.28); border-radius:12px; box-shadow:0 20px 40px rgba(0,0,0,0.45);">
      <div id="store-purchase-confirmation-message" style="color:#e2e8f0; font:600 14px system-ui; line-height:1.5;">
        Are you sure you want to buy ${escapeHtml(itemName)} for ${price} coins?
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
        <button id="store-purchase-confirmation-no" style="border:1px solid rgba(148,163,184,0.4); background:transparent; color:#cbd5e1; border-radius:8px; padding:7px 12px; font:600 12px system-ui; cursor:pointer;">No</button>
        <button id="store-purchase-confirmation-yes" style="border:none; background:#0ea5e9; color:white; border-radius:8px; padding:7px 12px; font:700 12px system-ui; cursor:pointer;">Yes</button>
      </div>
    </div>
  `;

  const closeModal = () => {
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      closeModal();
    }
  };

  overlay.querySelector<HTMLButtonElement>("#store-purchase-confirmation-no")!.onclick = closeModal;
  overlay.querySelector<HTMLButtonElement>("#store-purchase-confirmation-yes")!.onclick = () => {
    closeModal();
    onConfirm();
  };
  overlay.onclick = (event) => {
    if (event.target === overlay) {
      closeModal();
    }
  };

  document.body.appendChild(overlay);
  document.addEventListener("keydown", onKeyDown);
}

export function renderStore() {
  const refs = getLobbyRefs();

  if (!lobbyRuntime.isUserAuthenticated) {
    refs.storeListEl.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding: 28px; color: #94a3b8; font: 500 14px system-ui;">Sign in to view the store.</div>';
    return;
  }

  const owned = lobbyRuntime.ownedSkins;

  refs.storeListEl.innerHTML = Object.entries(SKINS_CATALOG)
    .map(([id, item]) => {
      const isOwned = owned.has(id);
      return `
      <button data-skin-id="${id}" ${isOwned ? "disabled" : ""}
        style="aspect-ratio:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; padding:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:10px; cursor:${isOwned ? "default" : "pointer"}; color:white; font:600 12px system-ui; text-align:center;">
        <img src="/skin_previews/${id}_preview.png" alt="${escapeHtml(item.name)}" style="width:70%; aspect-ratio:1; object-fit:cover; border-radius:8px;" />
        <span>${escapeHtml(item.name)}</span>
        <span style="color:${isOwned ? "#4ade80" : "#facc15"}; font-weight:700;">${isOwned ? "Owned" : `${item.price} 🪙`}</span>
      </button>
    `;
    })
    .join("");

  refs.storeListEl.querySelectorAll("button[data-skin-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const skinId = btn.getAttribute("data-skin-id");
      if (!skinId || owned.has(skinId)) return;
      const item = SKINS_CATALOG[skinId as keyof typeof SKINS_CATALOG];
      if (!item) return;
      openPurchaseConfirmation(item.name, item.price, () => lobbyRuntime.buySkinHandler?.(skinId));
    });
  });
}
