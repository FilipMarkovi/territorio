export const SKINS_CATALOG = {
  "skin_default": { name: "Classic Hex", price: 0 },
  "glitch_face": { name: "Glitch Face", price: 50 }
};

export const DEFAULT_SKIN_ID: keyof typeof SKINS_CATALOG = "skin_default";

export type SkinId = keyof typeof SKINS_CATALOG;

// Territory overlay tiling config, per skin. Skins without an entry (e.g. the default) render no overlay.
export interface SkinOverlayConfig {
  spanHexes: number; // how many hex-widths (HEX_SIZE units) one tiled copy of the skin image should span
  alpha: number; // opacity of the overlay drawn on top of the player's territory color
}

export const SKIN_OVERLAYS: Partial<Record<SkinId, SkinOverlayConfig>> = {
  "glitch_face": { spanHexes: 3, alpha: 0.55 }
};