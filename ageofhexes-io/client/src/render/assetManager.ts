import { SKINS_CATALOG, SKIN_OVERLAYS, type SkinId } from "../../../shared/storeItems.js";
import { HEX_SIZE } from "../../../shared/constants.js";

export const tileTextures = {
  grass: null as CanvasPattern | null,
  desert: null as CanvasPattern | null,
  mountain: null as CanvasPattern | null,
  water: null as CanvasPattern | null,
};

export type SkinTexture = { pattern: CanvasPattern; scale: number; alpha: number };
// Keyed by skinId. Only skins with a SKIN_OVERLAYS config end up populated here.
export const skinPatterns: Record<string, SkinTexture | null> = {};

export const buildingImages: Record<string, HTMLImageElement> = {};
export const shipImage: { sprite: HTMLImageElement | null } = { sprite: null };
export const projectileImages: Record<string, HTMLImageElement> = {};
export const tileEffectImages: { brokenGround: HTMLImageElement | null; plagued: HTMLImageElement | null } = {
  brokenGround: null,
  plagued: null,
};
export const playerEffectImages: Record<string, HTMLImageElement | null> = {
  ATTACK_SPEED: null,
  ARMY_GAIN_BUFF: null,
  HYPERINFLATION: null,
};

const asset_folder = "../../../assets/";

export function loadGameTextures(ctx: CanvasRenderingContext2D, onComplete: () => void) {
  // Define image sources
  const tileSources = {
    grass: asset_folder + "grass.jpg",
    desert: asset_folder + "desert.jpg",
    mountain: asset_folder + "mountain.jpg",
    water: asset_folder + "water.jpg",
  };

  // Add your building icon PNGs here (Make sure filenames match!)
  const buildingSources: Record<string, string> = {
    HOUSE: asset_folder + "house.png",
    BARRACKS: asset_folder + "barracks.png",
    FORT: asset_folder + "fort.png",
    LABORATORY: asset_folder + "laboratory.png",
    HARBOR: asset_folder + "harbor.png",
    SIEGE_OUTPOST: asset_folder + "siege_outpost.png",
    HQ: asset_folder + "hq.png",
    PLAGUE_SOURCE: asset_folder + "plague_source.png",
  };

  const miscSources = {
    ship: asset_folder + "ship.png",
    bombard: asset_folder + "bombard.png",
    plagueBomb: asset_folder + "plague_bomb.png",
  };

  const tileEffectSources = {
    brokenGround: asset_folder + "broken_ground.png",
    plagued: asset_folder + "plagued.png",
  };

  const playerEffectSources = {
    ATTACK_SPEED: asset_folder + "attack_speed_icon.png",
    ARMY_GAIN_BUFF: asset_folder + "army_gain_buff_icon.png",
    HYPERINFLATION: asset_folder + "hiperinflation_icon.png",
  };

  const skin_folder = "../../../skins/";
  const skinOverlaySources = (Object.keys(SKIN_OVERLAYS) as SkinId[]).map(
    (skinId): [SkinId, string] => [skinId, skin_folder + skinId + ".png"]
  );

  const totalImages =
    Object.keys(tileSources).length +
    Object.keys(buildingSources).length +
    Object.keys(miscSources).length +
    Object.keys(tileEffectSources).length +
    Object.keys(playerEffectSources).length +
    skinOverlaySources.length;
  let loadedCount = 0;

  function checkLoad() {
    loadedCount++;
    if (loadedCount === totalImages) {
      onComplete();
    }
  }

  // Load Tiles
  (Object.keys(tileSources) as Array<keyof typeof tileTextures>).forEach((key) => {
    const img = new Image();
    img.src = tileSources[key];
    img.onload = () => {
      tileTextures[key] = ctx.createPattern(img, "repeat");
      checkLoad();
    };

    img.onerror = () => {
      checkLoad(); 
    };
  });

  // Load Building Sprites
  Object.entries(buildingSources).forEach(([type, src]) => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      buildingImages[type] = img;
      checkLoad();
    };

    img.onerror = () => {
      checkLoad(); 
    };
  });

  // Load Misc Sprites
  Object.entries(miscSources).forEach(([type, src]) => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      if (type === "ship") shipImage.sprite = img;
      if (type === "bombard") projectileImages.BOMBARD = img;
      if (type === "plagueBomb") projectileImages.PLAGUE_BOMB = img;
      checkLoad();
    };

    img.onerror = () => {
      checkLoad();
    };
  });

  // Load Tile Effect Sprites
  Object.entries(tileEffectSources).forEach(([type, src]) => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      if (type === "brokenGround") tileEffectImages.brokenGround = img;
      if (type === "plagued") tileEffectImages.plagued = img;
      checkLoad();
    };

    img.onerror = () => {
      checkLoad();
    };
  });

  // Load Player Effect Sprites
  Object.entries(playerEffectSources).forEach(([type, src]) => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      playerEffectImages[type] = img;
      checkLoad();
    };

    img.onerror = () => {
      checkLoad();
    };
  });

  // Load Skin Overlay Textures (territory pattern tiled across a configurable span of hexes)
  skinOverlaySources.forEach(([skinId, src]) => {
    const config = SKIN_OVERLAYS[skinId];
    const img = new Image();
    img.src = src;
    img.onload = () => {
      const pattern = ctx.createPattern(img, "repeat");
      if (pattern && config) {
        skinPatterns[skinId] = { pattern, scale: (config.spanHexes * HEX_SIZE) / img.naturalWidth, alpha: config.alpha };
      }
      checkLoad();
    };

    img.onerror = () => {
      checkLoad();
    };
  });
}