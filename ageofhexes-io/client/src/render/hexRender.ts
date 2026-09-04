import type { TileState, PlayerId, BuildingType, SpecialBuildingType, CoreGameState } from "../../../shared/index.js";
import { canCaptureClient } from "../utils/canCapture.js";
import { camera } from "./camera.js";
import { getStripePattern } from "./patterns.js";
import { FILL_ALPHA, BUILDING_SIZE_MULTIPLIERS, HEX_SIZE, HARBOR_ATTACK_TIME_INCREASE } from "../../../shared/constants.js";
import { darken } from "./playerColors.js";
import { DEFENSE_HEAT_DECAY_MS, BUILDING_CONSTRUCTION_TIME, BUILDING_DEMOLISH_TIME, TILE_ATTACK_COOLDOWN } from "../../../shared/constants.js";
import { tileTextures, buildingImages, shipImage, tileEffectImages, playerEffectImages, skinPatterns } from "./assetManager.js";
import { getServerNow } from "../utils/time.js";

/**
 * BATCH PASS 1: Renders background textures, team color overlays, and 
 * combines all grid line boundaries into a single hardware stroke pass.
 */
export function drawHexBatch(
  ctx: CanvasRenderingContext2D,
  items: Array<{
    tile: TileState;
    x: number;
    y: number;
    worldX: number;
    worldY: number;
    color: string;
    fillAlpha: number;
    isHovered: boolean;
    ownerSkinId?: string | null;
  }>,
  size: number
) {
  const renderSize = size * camera.zoom;

  // 1. Draw Terrain Backgrounds and Ownership Fills
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { x, y, worldX, worldY, tile, color, fillAlpha, isHovered, ownerSkinId } = item;
    const owner = tile.ownerId;

    ctx.beginPath();
    for (let j = 0; j < 6; j++) {
      const angle = (Math.PI / 3) * j + Math.PI / 6;
      ctx.lineTo(
        x + renderSize * Math.cos(angle),
        y + renderSize * Math.sin(angle)
      );
    }
    ctx.closePath();

    if (!owner && !isHovered) {
      let activePattern: CanvasPattern | null = null;
      const tileTerrain = tile.terrain;
      if (tileTerrain === "GRASS") activePattern = tileTextures.grass;
      if (tileTerrain === "DESERT") activePattern = tileTextures.desert;
      if (tileTerrain === "MOUNTAIN") activePattern = tileTextures.mountain;
      if (tileTerrain === "WATER") activePattern = tileTextures.water;

      if (activePattern) {
        ctx.save();
        ctx.translate(-camera.x * camera.zoom + ctx.canvas.width / 2, -camera.y * camera.zoom + ctx.canvas.height / 2);
        
        const patternDetailScale = 0.5; 
        ctx.scale(camera.zoom * patternDetailScale, camera.zoom * patternDetailScale);
        
        ctx.beginPath();
        for (let j = 0; j < 6; j++) {
          const angle = (Math.PI / 3) * j + Math.PI / 6;
          ctx.lineTo(
            (worldX + size * Math.cos(angle)) / patternDetailScale, 
            (worldY + size * Math.sin(angle)) / patternDetailScale
          );
        }
        ctx.closePath();

        ctx.fillStyle = activePattern;
        ctx.fill();
        ctx.restore(); 
      } else {
        if (tileTerrain === "DESERT") ctx.fillStyle = "#af8246";
        else if (tileTerrain === "MOUNTAIN") ctx.fillStyle = "#424242";
        else if (tileTerrain === "WATER") ctx.fillStyle = "#1561b9";
        else ctx.fillStyle = "#58853e";
        ctx.fill();
      }
    }

    // Layer 2: TEAM COLOR / HOVER HIGHLIGHT OVERLAY
    ctx.save();
    ctx.globalAlpha = fillAlpha;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();

    // Layer 3: EQUIPPED SKIN OVERLAY - tiled pattern repeated across the player's territory
    if (owner && ownerSkinId) {
      const skinTex = skinPatterns[ownerSkinId];
      if (skinTex) {
        ctx.save();
        ctx.translate(-camera.x * camera.zoom + ctx.canvas.width / 2, -camera.y * camera.zoom + ctx.canvas.height / 2);
        ctx.scale(camera.zoom * skinTex.scale, camera.zoom * skinTex.scale);

        ctx.beginPath();
        for (let j = 0; j < 6; j++) {
          const angle = (Math.PI / 3) * j + Math.PI / 6;
          ctx.lineTo(
            (worldX + size * Math.cos(angle)) / skinTex.scale,
            (worldY + size * Math.sin(angle)) / skinTex.scale
          );
        }
        ctx.closePath();

        ctx.globalAlpha = skinTex.alpha;
        ctx.fillStyle = skinTex.pattern;
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // 2. High Performance Unified Grid Lines Pass
  ctx.lineWidth = Math.min(2, 2 / camera.zoom);
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { x, y } = item;
    for (let j = 0; j < 6; j++) {
      const angle = (Math.PI / 3) * j + Math.PI / 6;
      const px = x + renderSize * Math.cos(angle);
      const py = y + renderSize * Math.sin(angle);
      if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  ctx.stroke();
}

/**
 * BATCH PASS 2: Renders dynamic grid shield flashes and local defense heat tracking layers.
 */
export function drawHexEffectsBatch(
  ctx: CanvasRenderingContext2D,
  items: any[],
  size: number
) {
  const now = getServerNow();
  const renderSize = size * camera.zoom;
  const brokenGroundImage = tileEffectImages.brokenGround;
  const plaguedImage = tileEffectImages.plagued;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { x, y, tile } = item;

    if (
      brokenGroundImage &&
      brokenGroundImage.complete &&
      brokenGroundImage.naturalWidth > 0 &&
      tile.effects.some((effect: any) => effect.type === "BROKEN_GROUND")
    ) {
      const imgSize = renderSize * 2.2;

      ctx.save();
      ctx.beginPath();
      for (let j = 0; j < 6; j++) {
        const angle = (Math.PI / 3) * j + Math.PI / 6;
        const px = x + renderSize * Math.cos(angle);
        const py = y + renderSize * Math.sin(angle);
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.clip();
      ctx.globalAlpha = 0.9;
      ctx.drawImage(brokenGroundImage, x - imgSize / 2, y - imgSize / 2, imgSize, imgSize);
      ctx.restore();
    }

    if (
      plaguedImage &&
      plaguedImage.complete &&
      plaguedImage.naturalWidth > 0 &&
      tile.effects.some((effect: any) => effect.type === "PLAGUED")
    ) {
      const imgSize = renderSize * 2.2;

      ctx.save();
      ctx.beginPath();
      for (let j = 0; j < 6; j++) {
        const angle = (Math.PI / 3) * j + Math.PI / 6;
        const px = x + renderSize * Math.cos(angle);
        const py = y + renderSize * Math.sin(angle);
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.clip();
      ctx.globalAlpha = 0.9;
      ctx.drawImage(plaguedImage, x - imgSize / 2, y - imgSize / 2, imgSize, imgSize);
      ctx.restore();
    }

    const timeSinceLast = now - (tile.lastDefendedAt || 0);
    if (timeSinceLast > DEFENSE_HEAT_DECAY_MS) continue;

    // EFFECT 1: ATTACK COOLDOWN (The 1-second "Stun")
    if (timeSinceLast < TILE_ATTACK_COOLDOWN) {
      const p = 1 - (timeSinceLast / TILE_ATTACK_COOLDOWN);
      ctx.save();
      ctx.beginPath();
      for (let j = 0; j < 6; j++) {
        const angle = (Math.PI / 3) * j + Math.PI / 6;
        const px = x + renderSize * Math.cos(angle);
        const py = y + renderSize * Math.sin(angle);
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      
      ctx.strokeStyle = `rgba(255, 255, 255, ${p * 0.8})`;
      ctx.lineWidth = 4 * camera.zoom;
      ctx.stroke();
      
      ctx.fillStyle = `rgba(255, 255, 255, ${p * 0.2})`;
      ctx.fill();
      ctx.restore();
    }

    // EFFECT 2: DEFENSE HEAT (The 10-second "Heat")
    if (timeSinceLast < DEFENSE_HEAT_DECAY_MS && tile.defenseHeat > 0) {
      const p = 1 - (timeSinceLast / DEFENSE_HEAT_DECAY_MS);
      const radius = renderSize * 0.75;
      
      ctx.save();
      const heatColor = tile.defenseHeat >= 3 ? "#ec2d2d" : "#ec9150d7";
      
      ctx.setLineDash([4 * camera.zoom, 4 * camera.zoom]);
      ctx.strokeStyle = heatColor;
      ctx.globalAlpha = p * 0.6;
      ctx.lineWidth = (1 + tile.defenseHeat) * camera.zoom;
      
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}


/**
 * BATCH PASS 3: Static building geometries.
 * Sets the drawing styles once to remove redundant pipeline state switches.
 * draws building icons if loaded, otherwise draws vector shapes.
 */
export function drawBuildingsBatch(
  ctx: CanvasRenderingContext2D,
  items: any[],
  size: number
) {
  const s = size * camera.zoom * 0.35;

  // 1. Draw structural ground shadows together
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { x, y, tile } = item;
    if (!tile.building && !tile.buildingAction && !tile.specialBuilding) continue;

    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.9, s * 1.2, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. Lock uniform layout styles once for all building vector loops
  ctx.save();
  ctx.lineWidth = Math.max(1.5, 2 * camera.zoom);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "#ffffffb2"; 
  ctx.fillStyle = "rgba(20, 24, 28, 0.9)"; 

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { x, y, tile } = item;

    let type: BuildingType | "HQ" | SpecialBuildingType | null = null;
    if (tile.buildingAction) {
      type = tile.buildingAction.building;
    } else if (tile.building) {
      type = tile.building;
    } else if (tile.specialBuilding) {
      type = tile.specialBuilding;
    }
    if (!type) continue;

    const img = buildingImages[type];
    if (img && img.complete && img.naturalWidth !== 0) {
      const imgSize = s * 2.4 * (BUILDING_SIZE_MULTIPLIERS.get(type as any) ?? 1);
      ctx.drawImage(img, x - imgSize / 2, y - imgSize / 2, imgSize, imgSize);
      continue;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();

    switch (type) {
      case "HOUSE":
        ctx.moveTo(-s * 0.8, s * 0.8); ctx.lineTo(s * 0.8, s * 0.8);
        ctx.lineTo(s * 0.8, -s * 0.2); ctx.lineTo(0, -s * 0.8); 
        ctx.lineTo(-s * 0.8, -s * 0.2); ctx.closePath();
        ctx.moveTo(-s * 0.25, s * 0.8); ctx.lineTo(-s * 0.25, s * 0.2);
        ctx.lineTo(s * 0.25, s * 0.2); ctx.lineTo(s * 0.25, s * 0.8);
        break;

      case "BARRACKS":
        ctx.moveTo(-s * 0.7, -s * 0.7); ctx.lineTo(s * 0.7, s * 0.7);
        ctx.moveTo(-s * 0.7, -s * 0.7); ctx.lineTo(-s * 0.3, -s * 0.7);
        ctx.lineTo(-s * 0.7, -s * 0.3);
        ctx.moveTo(s * 0.4, s * 0.4); ctx.lineTo(s * 0.6, s * 0.2);
        ctx.moveTo(s * 0.7, -s * 0.7); ctx.lineTo(-s * 0.7, s * 0.7);
        ctx.moveTo(s * 0.7, -s * 0.7); ctx.lineTo(s * 0.3, -s * 0.7);
        ctx.lineTo(s * 0.7, -s * 0.3);
        ctx.moveTo(-s * 0.4, s * 0.4); ctx.lineTo(-s * 0.6, s * 0.2);
        break;

      case "FORT":
        ctx.moveTo(-s * 0.9, s * 0.9); ctx.lineTo(s * 0.9, s * 0.9);
        ctx.lineTo(s * 0.9, -s * 0.5);
        ctx.lineTo(s * 0.5, -s * 0.5); ctx.lineTo(s * 0.5, -s * 0.2);
        ctx.lineTo(s * 0.2, -s * 0.2); ctx.lineTo(s * 0.2, -s * 0.5);
        ctx.lineTo(-s * 0.2, -s * 0.5); ctx.lineTo(-s * 0.2, -s * 0.2);
        ctx.lineTo(-s * 0.5, -s * 0.2); ctx.lineTo(-s * 0.5, -s * 0.5);
        ctx.lineTo(-s * 0.9, -s * 0.5); ctx.closePath();
        ctx.moveTo(-s * 0.3, s * 0.9); ctx.lineTo(-s * 0.3, s * 0.4);
        ctx.arc(0, s * 0.4, s * 0.3, Math.PI, 0); 
        ctx.lineTo(s * 0.3, s * 0.9);
        break;
      
      case "LABORATORY":
        ctx.moveTo(-s * 0.9, s * 0.8);  
        ctx.lineTo(s * 0.9, s * 0.8);   
        ctx.lineTo(s * 0.25, -s * 0.1);
        ctx.lineTo(s * 0.25, -s * 0.7); 
        ctx.lineTo(s * 0.4, -s * 0.7);  
        ctx.lineTo(s * 0.4, -s * 0.85);
        ctx.lineTo(-s * 0.4, -s * 0.85);
        ctx.lineTo(-s * 0.4, -s * 0.7); 
        ctx.lineTo(-s * 0.25, -s * 0.7);
        ctx.lineTo(-s * 0.25, -s * 0.1);
        ctx.closePath();
        break;

      case "HARBOR":
        ctx.moveTo(-s * 0.9, s * 0.55);
        ctx.lineTo(s * 0.9, s * 0.55);
        ctx.lineTo(s * 0.65, s * 0.9);
        ctx.lineTo(-s * 0.65, s * 0.9);
        ctx.closePath();
        ctx.moveTo(-s * 0.2, s * 0.55);
        ctx.lineTo(-s * 0.2, -s * 0.7);
        ctx.lineTo(s * 0.35, -s * 0.45);
        ctx.lineTo(-s * 0.2, -s * 0.2);
        ctx.moveTo(-s * 0.4, -s * 0.05);
        ctx.lineTo(s * 0.25, 0);
        break;

      case "SIEGE_OUTPOST":
        ctx.beginPath();
        ctx.moveTo(0, s * 0.45); 
        ctx.quadraticCurveTo(-s * 0.5, s * 0.45, -s * 0.85, s * 0.85);
        ctx.lineTo(-s * 0.65, s * 0.85);
        ctx.quadraticCurveTo(-s * 0.3, s * 0.5, 0, s * 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-s * 0.65, s * 0.3);   
        ctx.lineTo(-s * 0.48, s * 0.0);   
        ctx.lineTo(s * 0.75, -s * 0.5);   
        ctx.lineTo(s * 0.7, -s * 0.58);
        ctx.lineTo(s * 0.83, -s * 0.64);
        ctx.lineTo(s * 0.96, -s * 0.38);
        ctx.lineTo(s * 0.83, -s * 0.32);
        ctx.lineTo(s * 0.58, -s * 0.2);   
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(-s * 0.6, s * 0.17, s * 0.09, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, s * 0.45, s * 0.45, 0, Math.PI * 2); 
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, s * 0.45, s * 0.11, 0, Math.PI * 2); 
        ctx.stroke();

        ctx.moveTo(-s * 0.45, s * 0.45); ctx.lineTo(s * 0.45, s * 0.45); 
        ctx.moveTo(0, s * 0.0);          ctx.lineTo(0, s * 0.9);          
        ctx.stroke();

        ctx.beginPath();
        break;
        
      case "HQ":
        ctx.moveTo(-s * 0.7, s * 0.8); ctx.lineTo(s * 0.7, s * 0.8); 
        ctx.lineTo(s * 0.9, -s * 0.5); 
        ctx.lineTo(s * 0.4, -s * 0.1); 
        ctx.lineTo(0, -s * 0.9);       
        ctx.lineTo(-s * 0.4, -s * 0.1); 
        ctx.lineTo(-s * 0.9, -s * 0.5); 
        ctx.closePath();
        ctx.moveTo(0, s * 0.5); ctx.arc(0, s * 0.5, s * 0.1, 0, Math.PI * 2);
        ctx.moveTo(-s * 0.4, s * 0.5); ctx.arc(-s * 0.4, s * 0.5, s * 0.08, 0, Math.PI * 2);
        ctx.moveTo(s * 0.4, s * 0.5); ctx.arc(s * 0.4, s * 0.5, s * 0.08, 0, Math.PI * 2);
        break;

      case "PLAGUE_SOURCE":
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.35, 0, Math.PI * 2);
        ctx.stroke();
        break;
    }

    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

const HQ_EFFECT_ICON_ORDER = ["ATTACK_SPEED", "ARMY_GAIN_BUFF", "HYPERINFLATION"] as const;

export function drawPlayerEffectIconsBatch(
  ctx: CanvasRenderingContext2D,
  items: any[],
  size: number,
  state: CoreGameState
) {
  const s = size * camera.zoom * 0.35;
  const iconSize = Math.max(12, s * 0.9);
  const iconSpacing = Math.max(2, iconSize * 0.2);
  const offsetY = s * -1.2;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { x, y, tile } = item;
    if (tile.building !== "HQ" || !tile.ownerId) continue;

    const owner = state.players.get(tile.ownerId);
    if (!owner || !owner.effects || owner.effects.length === 0) continue;

    const activeTypes = new Set(owner.effects.map((effect) => effect.type));
    const renderTypes = HQ_EFFECT_ICON_ORDER.filter((effectType) => activeTypes.has(effectType));
    if (renderTypes.length === 0) continue;

    const totalWidth = renderTypes.length * iconSize + (renderTypes.length - 1) * iconSpacing;
    let iconX = x - totalWidth / 2;
    const iconY = y - offsetY;

    for (let j = 0; j < renderTypes.length; j++) {
      const effectType = renderTypes[j];
      const img = playerEffectImages[effectType];
      if (!img || !img.complete || img.naturalWidth === 0) {
        iconX += iconSize + iconSpacing;
        continue;
      }

      ctx.drawImage(img, iconX, iconY, iconSize, iconSize);
      iconX += iconSize + iconSpacing;
    }
  }
}

/**
 * BATCH PASS 4: Linear capture progress tracking rings.
 */
const visualProgressMap = new Map<string, number>();
export function drawCaptureHexBatch(
  ctx: CanvasRenderingContext2D,
  items: any[],
  size: number,
  deltaTime: number
) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { tile, x, y, captureColor } = item;
    if (!tile.capture) continue;

    // Use remaining -> convert to progress fraction for visuals
    const serverProgress = tile.capture ? (1 - (tile.capture.remaining ?? 1)) : 0;
    const tileKey = `${tile.q},${tile.r}`;
    
    let visualProgress = visualProgressMap.get(tileKey) ?? 0;
    if (serverProgress === 0 || visualProgress > serverProgress) visualProgress = 0;

    const lerpSpeed = 10 * deltaTime; 
    visualProgress += (serverProgress - visualProgress) * lerpSpeed;
    visualProgressMap.set(tileKey, visualProgress);

    const innerSize = size * camera.zoom * 0.9; 
    
    const corners: {x: number, y: number}[] = [];
    for (let j = 0; j < 6; j++) {
      const angle = (Math.PI / 3) * j - Math.PI / 2;
      corners.push({
        x: x + innerSize * Math.cos(angle),
        y: y + innerSize * Math.sin(angle)
      });
    }
    corners.push(corners[0]);

    ctx.save();
    ctx.strokeStyle = captureColor;
    ctx.lineWidth = Math.max(2, 4 * camera.zoom);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);

    const totalSides = 6;
    const currentProgress = Math.min(visualProgress, 1) * totalSides;

    for (let j = 0; j < totalSides; j++) {
      const sideProgress = Math.max(0, Math.min(1, currentProgress - j));
      if (sideProgress <= 0) break;

      const start = corners[j];
      const end = corners[j + 1];
      ctx.lineTo(
        start.x + (end.x - start.x) * sideProgress,
        start.y + (end.y - start.y) * sideProgress
      );
    }

    ctx.stroke();
    ctx.restore();
  }
}

/**
 * BATCH PASS 5: Industrial construction/demolition progress gauges.
 */
export function drawBuildingProgressBarsBatch(
  ctx: CanvasRenderingContext2D,
  items: any[],
  size: number
) {
  const now = getServerNow();
  const s = size * camera.zoom * 0.35;
  const barWidth = s * 1.5;
  const barHeight = Math.max(4, 5 * camera.zoom);
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { x, y, tile } = item;
    if (!tile.buildingAction) continue;

    const action = tile.buildingAction;
    const totalDurationMs = (action.actionType === "CONSTRUCTING"
      ? BUILDING_CONSTRUCTION_TIME[action.building as BuildingType]
      : BUILDING_DEMOLISH_TIME[action.building as BuildingType]) * 1000;

    const timeLeft = action.readyAt - now;
    const progress = Math.max(0, Math.min(1, 1 - (timeLeft / totalDurationMs)));

    const barX = x - barWidth / 2;
    const barY = y + s * 1.0; 

    ctx.save();
    ctx.fillStyle = "rgba(10, 12, 15, 0.85)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, barHeight / 2);
    ctx.fill();
    ctx.stroke();

    if (progress > 0) {
      ctx.fillStyle = action.actionType === "CONSTRUCTING" ? "#34d399" : "#f87171";
      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth * progress, barHeight, barHeight / 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// Module-level cache to track local smooth interpolation per capture target
interface ShipClientState {
  startTime: number;
  lastCompleteAt: number;
  totalNavalMoveMs: number;
}

const shipClientStates = new Map<string, ShipClientState>();

/**
 * BATCH PASS 6: Draw cached naval attack lines sent by the server.
 * Uses local client-side tracking for silky smooth 60fps movement.
 */
export function drawWaterAttackPaths(ctx: CanvasRenderingContext2D, state: any) {
  const now = getServerNow();
  const halfW = ctx.canvas.width / 2;
  const halfH = ctx.canvas.height / 2;
  const shipSprite = shipImage.sprite;

  const activeTargetsThisFrame = new Set<string>();

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const [targetKey, tile] of state.tiles.entries()) {
    const capture = tile.capture;
    const naval = capture?.naval;
    if (!capture || !naval || naval.path.length < 2) continue;

    activeTargetsThisFrame.add(targetKey);

    const attacker = state.players.get(capture.by);
    const stroke = attacker?.color ?? "#ffffff";

    // 1. Parse World Coordinates for the path
    const routeWorld: Array<{ x: number; y: number }> = [];
    for (const pathKey of naval.path) {
      const [qRaw, rRaw] = pathKey.split(",");
      const q = Number(qRaw);
      const r = Number(rRaw);
      if (Number.isNaN(q) || Number.isNaN(r)) continue;

      const worldX = HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
      const worldY = HEX_SIZE * (1.5 * r);
      routeWorld.push({ x: worldX, y: worldY });
    }

    if (routeWorld.length < 2) continue;

    // 2. Render Path Line (Dotted)
    ctx.beginPath();
    for (let i = 0; i < routeWorld.length; i++) {
      const pt = routeWorld[i];
      const x = (pt.x - camera.x) * camera.zoom + halfW;
      const y = (pt.y - camera.y) * camera.zoom + halfH;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(2, 3 * camera.zoom);
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([8 * camera.zoom, 6 * camera.zoom]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!shipSprite || !shipSprite.complete || shipSprite.naturalWidth === 0) continue;

    // 3. Client Local Tracking for Smooth Movement
    const totalPathSegments = routeWorld.length - 1;
    const totalNavalMoveMs = totalPathSegments * HARBOR_ATTACK_TIME_INCREASE;
    const serverCompleteAt = capture.completeAt ?? 0;

    let clientState = shipClientStates.get(targetKey);

    if (
      !clientState ||
      Math.abs(clientState.lastCompleteAt - serverCompleteAt) > 200
    ) {
      const remaining = Math.max(0, Math.min(1, capture.remaining ?? 1));
      const estimatedTotalDuration =
        serverCompleteAt > now && remaining > 0
          ? (serverCompleteAt - now) / remaining
          : totalNavalMoveMs;

      const calculatedStartTime = now - estimatedTotalDuration * (1 - remaining);

      clientState = {
        startTime: calculatedStartTime,
        lastCompleteAt: serverCompleteAt,
        totalNavalMoveMs,
      };
      shipClientStates.set(targetKey, clientState);
    }

    const elapsedMs = Math.max(0, now - clientState.startTime);

    // 4. Determine Position & Orientation
    let shipWorldX = 0;
    let shipWorldY = 0;
    let headingAngle = 0;

    const lastWater = routeWorld[routeWorld.length - 2];
    const targetLand = routeWorld[routeWorld.length - 1];

    // Calculate beachhead stop point (edge of land tile instead of center)
    const beachVx = targetLand.x - lastWater.x;
    const beachVy = targetLand.y - lastWater.y;
    const beachLen = Math.hypot(beachVx, beachVy) || 1;
    
    // Exact position at the shoreline
    const beachStopX = targetLand.x - (beachVx / beachLen) * (HEX_SIZE * 0.75);
    const beachStopY = targetLand.y - (beachVy / beachLen) * (HEX_SIZE * 0.75);

    if (elapsedMs < totalNavalMoveMs && totalNavalMoveMs > 0) {
      // SAILING PHASE
      const progress = elapsedMs / HARBOR_ATTACK_TIME_INCREASE;
      const segmentIndex = Math.min(totalPathSegments - 1, Math.floor(progress));
      const t = Math.max(0, Math.min(1, progress - segmentIndex));

      const from = routeWorld[segmentIndex];
      const isLastSegment = segmentIndex === totalPathSegments - 1;
      
      // If on final segment, move smoothly towards beachStop instead of center of target tile
      const to = isLastSegment 
        ? { x: beachStopX, y: beachStopY } 
        : routeWorld[segmentIndex + 1];

      shipWorldX = from.x + (to.x - from.x) * t;
      shipWorldY = from.y + (to.y - from.y) * t;
      headingAngle = Math.atan2(to.y - from.y, to.x - from.x);
    } else {
      // PARKED PHASE: Lock onto beachhead stop position smoothly without snapping
      shipWorldX = beachStopX;
      shipWorldY = beachStopY;
      headingAngle = Math.atan2(beachVy, beachVx);
    }

    // 5. Draw Upright Ship Sprite (Max 90deg left/right rotation)
    const shipX = (shipWorldX - camera.x) * camera.zoom + halfW;
    const shipY = (shipWorldY - camera.y) * camera.zoom + halfH;
    const shipW = HEX_SIZE * camera.zoom * 1.2;
    const shipH = HEX_SIZE * camera.zoom * 1.2;

    ctx.save();
    ctx.translate(shipX, shipY);

    // Convert heading angle from standard math (0 = East, Math.PI/2 = South)
    // to screen direction, ensuring ship never upside down:
    const headingDeg = headingAngle * (180 / Math.PI);

    // If traveling generally West/Left (-90 to -180, or 90 to 180)
    if (Math.abs(headingDeg) > 90) {
      ctx.scale(-1, 1); // Flip horizontally so sprite faces left
      // Calculate remaining tilt constrained between -90 and 90
      const tilt = headingDeg > 0 ? 180 - headingDeg : -180 - headingDeg;
      ctx.rotate((tilt * Math.PI) / 180);
    } else {
      // Facing East/Right: direct tilt rotation constrained to [-90, 90]
      ctx.rotate((headingDeg * Math.PI) / 180);
    }

    ctx.globalAlpha = 0.98;
    ctx.drawImage(shipSprite, -shipW / 2, -shipH / 2, shipW, shipH);
    ctx.restore();
  }

  // Cleanup finished or canceled attacks
  for (const key of shipClientStates.keys()) {
    if (!activeTargetsThisFrame.has(key)) {
      shipClientStates.delete(key);
    }
  }

  ctx.restore();
}

/**
 * OPTIMIZED: Uses flat positional parameters to eliminate anonymous 
 * config wrapper object instantiations from your core map sweep loop.
 */
export function getTileColor(
  tile: TileState,
  hovered: boolean,
  state: any,
  playerId: PlayerId,
  isCutOff: boolean,
  connectedByPlayer: Map<PlayerId, Set<string>>
) {
  let color = "#444";
  const owner = tile.ownerId ? state.players.get(tile.ownerId) : null;

  if (!owner) {
    color = "#33333377";
  } else {
    color = owner.color;
  }

  //if (tile.defense > 1) {
  //  if (owner) color = darken(owner.color, 0.75);
  //  else color = "#202020ff";
  //}

  let fillAlpha = FILL_ALPHA;
  if (isCutOff) {
    fillAlpha = 0.18;
  }

  if (tile.terrain === "BEDROCK") {
    color = "#111"; 
    fillAlpha = 1;
  }

  if (hovered) {
    const ok = canCaptureClient(state, playerId, tile.q, tile.r, connectedByPlayer);
    color = ok ? "#6b7cff" : "rgba(216, 121, 121, 1)";
    fillAlpha = 0.45;
  }

  return { color, fillAlpha };
}

export function drawHexStripes(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>) {
  ctx.save();
  ctx.clip();
  ctx.fillStyle = getStripePattern(ctx)!;
  ctx.fillRect(pts[0][0] - 100, pts[0][1] - 100, 200, 200);
  ctx.restore();
}