
import { 
  drawHexBatch, 
  getTileColor, 
  drawHexEffectsBatch, 
  drawWaterAttackPaths,
  drawBuildingsBatch, 
  drawPlayerEffectIconsBatch,
  drawCaptureHexBatch, 
  drawBuildingProgressBarsBatch 
} from "./render/hexRender.js";
import { drawHexTextBatch } from "./render/text.js";
import { pixelToAxial } from "./utils/hexMath.js";
import { drawHUD, drawTargetingHUD } from "./ui/hud.js";
import { connect } from "./net/socket.js";
import { clientNetState,clientUIState } from "./state/clientState.js";
import type { CoreGameState, PlayerId } from "../../shared/index.js";
import { buildWaterNetwork, getHexDistance, getEffectiveGoldCost } from "../../shared/util.js";
import { initPan } from "./input/pan.js";
import { initZoom } from "./input/zoom.js";
import { camera, clampCamera, setMapBounds } from "./render/camera.js";
import { BASE_CAPTURE_COST, DEFENSE_COST_INCREMENT, HEX_SIZE, MIN_HQ_DISTANCE, DEFEND_COST_RATIO, SPECIAL_ATTACK_COSTS, SPECIAL_ATTACK_RANGES } from "../../shared/constants.js";
import { clearBuildMode } from "./ui/buildMode.js";
import { initKeyboard } from "./input/keyboard.js";
import { initBuildButtons, updateBuildButtons } from "./ui/buildButtons.js";
import { getConnectedTilesFromHQ_Client } from "./utils/supply.js";
import { drawTileInfo } from "./ui/tileInfo.js";
import { handleLobbyRouteState, handlePrivateLobbyUpdate, hideError, initLobbyUI, showError, showSuccess } from "./ui/lobby/index.js";
import { scheduleLobbyUIUpdate } from "./ui/lobby/state.js";
import { maybeJoinPrivateRoute } from "./ui/lobby/routes.js";
import { addGameLog, drawGameLogs, initHudUI } from "./ui/hud.js";
import { loadGameTextures } from "./render/assetManager.js";
import { drawProjectiles, enqueueProjectile } from "./render/projectiles.js";
import { initPlacementTimerUI,updatePlacementTimerUI } from "./ui/placementTimer.js";
import { initLatencyDisplay } from "./ui/latencyDisplay.js";
import { clearAbilityMode } from "./ui/abilityMode.js";
import { clearSiegeAttackMode } from "./ui/siegeAttackMode.js";
import { supabase, handleAuthPopupIfNeeded } from "./utils/db.js";
import { initAntiMultiTab } from "./utils/antiMultiTab.js";
import { setupAuthAndUsername, updateCoinsDisplay } from "./ui/lobby/auth.js";
import { lobbyRuntime } from "./ui/lobby/state.js";
import { showActionError } from "./ui/hud.js";
import { getSelectedServerHost } from "./constants/servers.js";
import { loadSettings, onSettingsChanged } from "./input/settings.js";

if (await handleAuthPopupIfNeeded()) {
  throw new Error("AgeOfHexes auth popup completed.");
}

if (!(await initAntiMultiTab())) {
  throw new Error("Another AgeOfHexes tab is already running.");
}

let mouseDownPos: { x: number; y: number } | null = null;
let didDrag = false;
let hoveredHex: { q: number; r: number } | null = null;
let hasCenteredCamera = false;
export let connectedByPlayer = new Map<PlayerId, Set<string>>();
export let myPlannedBuildingCounts: Record<string, number> = {};
export let myConTileCount: number | null = 0;

const DRAG_THRESHOLD = 14; // pixels

const backendHost = window.location.hostname === "localhost"
  ? "localhost:6767"
  : getSelectedServerHost();

const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsUrl = `${protocol}//${backendHost}`;

function skinPurchaseErrorMessage(reason?: string): string {
  switch (reason) {
    case "ALREADY_OWNED": return "You already own this skin.";
    case "INSUFFICIENT_FUNDS": return "Not enough coins.";
    case "NOT_AUTHED": return "Sign in to buy skins.";
    case "INVALID_ITEM": return "Invalid item.";
    default: return "Failed to purchase skin.";
  }
}

export const { sendIntent, tryAuth } = connect(wsUrl, {
  onWelcome: async (id, requiredPlayers, roomId) => {
    clientNetState.playerId = id;
    clientNetState.lobby = { connected: 0, required: requiredPlayers, roomId, matchStartAt: null };

    const { data: { session } } = await supabase.auth.getSession();
    maybeJoinPrivateRoute({ sendIntent, hideError, showError });
    
    if (session && session.access_token) {
      tryAuth(session.access_token);
    }

    scheduleLobbyUIUpdate();
  },
  onLobby: (connected, required, roomId, matchStartAt) => {
    clientNetState.lobby = { connected, required, roomId, matchStartAt };
    if (clientNetState.isReturningToLobby) {
      clientNetState.isReturningToLobby = false;
      clientNetState.state = null;
      clientUIState.phase = "LOBBY";
    }
    maybeJoinPrivateRoute({ sendIntent, hideError, showError });
    scheduleLobbyUIUpdate();
  },
  onLog: (text, color) => {
    addGameLog(text, color);
  },
  onDisconnected: () => {
    //showError("Disconnected from server. Attempting to reconnect...");
  },
  onReconnected: () => {
    //showSuccess("Reconnected.");
  },
  onPrivateLobby: (msg) => {
    handlePrivateLobbyUpdate(msg);
  },
  onPrivateError: (reason) => {
    showError(reason);
  },
  onAuthSuccess: (username, coins, ownedSkins) => {
    if (username) {
      showSuccess(`Signed in as ${username}`);
    }
    if (typeof coins === "number") {
      updateCoinsDisplay(coins);
    }
    if (ownedSkins) {
      lobbyRuntime.ownedSkins = new Set(ownedSkins);
    }
    scheduleLobbyUIUpdate();
  },
  onAuthFailure: (reason) => {
    showError(reason ?? "Authentication failed.");
  },
  onCoinsUpdate: (coins) => {
    updateCoinsDisplay(coins);
  },
  onSkinPurchaseResult: (msg) => {
    if (msg.success) {
      lobbyRuntime.ownedSkins.add(msg.skinId);
      updateCoinsDisplay(msg.coins);
      showSuccess("Skin purchased.");
    } else {
      showError(skinPurchaseErrorMessage(msg.reason));
    }
    scheduleLobbyUIUpdate();
  },
  onUsernameChangeResult: async (msg) => {
    if (msg.success) {
      const nextUsername = msg.username ?? "your new name";
      addGameLog(`Username changed to ${nextUsername}`, "#4ade80");
      showSuccess(`Username changed to ${nextUsername}`);
      await setupAuthAndUsername(sendIntent);
      return;
    }

    if (msg.reason === "USERNAME_TAKEN") {
      showError("That username is already taken.");
      return;
    }

    if (msg.reason === "INVALID_USERNAME") {
      showError("Username must be between 1 and 15 characters.");
      return;
    }

    if (msg.reason === "NOT_AUTHED") {
      showError("Sign in first before changing username.");
      return;
    }

    showError("Failed to change username. Please try again.");
  },
  onMatchResults: (stats) => {
    if (clientUIState.phase === "PLAYING") {
      clientNetState.matchStats = stats;
    } else {
      clientNetState.matchStats = null;
    }
    scheduleLobbyUIUpdate();
  },
  onSpecialAttackLaunched: (msg) => {
    enqueueProjectile({
      attackType: msg.attackType,
      sourceQ: msg.sourceQ,
      sourceR: msg.sourceR,
      targetQ: msg.targetQ,
      targetR: msg.targetR,
      travelMs: msg.travelMs,
      serverTime: msg.serverTime,
    });
  },
  onState: (state) => {
    if (clientNetState.isReturningToLobby) {
      return;
    }

    clientNetState.state = state;

    if (!hasCenteredCamera && state.tiles.size > 0) {
      hasCenteredCamera = true;

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const tile of state.tiles.values()) {
        const worldX = HEX_SIZE * (Math.sqrt(3) * tile.q + (Math.sqrt(3) / 2) * tile.r);
        const worldY = HEX_SIZE * (1.5 * tile.r);
        if (worldX < minX) minX = worldX;
        if (worldX > maxX) maxX = worldX;
        if (worldY < minY) minY = worldY;
        if (worldY > maxY) maxY = worldY;
      }

      setMapBounds({ minX, maxX, minY, maxY });
      camera.x = (minX + maxX) / 2;
      camera.y = (minY + maxY) / 2;
      clampCamera();
    }

    const waterNetwork = buildWaterNetwork(state);

    connectedByPlayer.clear();
    for (const p of state.players.values()) {
      if (!p.eliminated) {
        connectedByPlayer.set(p.id, getConnectedTilesFromHQ_Client(state, p.id, waterNetwork));
      }
    }

    // Tracking under construction and active buildings for button greyout limits
    myPlannedBuildingCounts = {};

    const meId = clientNetState.playerId;
    if (meId && state) {
      for (const tile of state.tiles.values()) {
        if (tile.ownerId === meId) {
          // Track existing, fully operational layouts
          if (tile.building) {
            const bKey = tile.building.toLowerCase();
            myPlannedBuildingCounts[bKey] = (myPlannedBuildingCounts[bKey] || 0) + 1;
          }
          // Track building footprints currently under a construction timer
          if (tile.buildingAction && tile.buildingAction.actionType === "CONSTRUCTING") {
            const bKey = tile.buildingAction.building.toLowerCase();
            myPlannedBuildingCounts[bKey] = (myPlannedBuildingCounts[bKey] || 0) + 1;
          }
        }
      }
    }
    
    myConTileCount = connectedByPlayer.get(meId ?? "")?.size ?? 0;

    const me = meId ? state.players.get(meId) : null;

    if (state.gameOver) {
      clientUIState.phase = "GAME_OVER";
      handleLobbyRouteState(sendIntent);
      scheduleLobbyUIUpdate();
      return;
    }

    if (me?.status === "PLAYING") {
      clientUIState.phase = "PLAYING";
    } else if (me?.status === "QUEUED") {
      clientUIState.phase = "QUEUED";
    } else {
      clientUIState.phase = "LOBBY";
    }

    if (!state.started) {
      hoveredHex = null;
      clientUIState.selectedBuilding = null;
      clientUIState.selectedSpecialAttack = null;
    }

    handleLobbyRouteState(sendIntent);
    scheduleLobbyUIUpdate();
  }
});

const canvas = document.getElementById("c") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
loadGameTextures(ctx, () => {});

initLobbyUI(sendIntent);
initHudUI(sendIntent);
initPan(canvas);
initZoom(canvas);
initBuildButtons();
initKeyboard();
initPlacementTimerUI();
initLatencyDisplay();


function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

canvas.addEventListener("mousedown", (e) => {
  mouseDownPos = { x: e.clientX, y: e.clientY };
  didDrag = false;
});

canvas.addEventListener("mousemove", (e) => {
  if (!mouseDownPos) return;

  const dx = e.clientX - mouseDownPos.x;
  const dy = e.clientY - mouseDownPos.y;

  if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
    didDrag = true;
  }
});

// hover hex
canvas.addEventListener("mousemove", (e) => {
const rect = canvas.getBoundingClientRect()

const screenX = e.clientX - rect.left
const screenY = e.clientY - rect.top

  const worldX =
    (screenX - canvas.width / 2) / camera.zoom + camera.x
  const worldY =
    (screenY - canvas.height / 2) / camera.zoom + camera.y  
  const { q, r } = pixelToAxial(
  worldX,
  worldY,
  HEX_SIZE,
  0,
  0
);
  hoveredHex = { q, r };
});

// attack / place building / defend / special attack
canvas.addEventListener("click", () => {
  if (clientUIState.phase !== "PLAYING") return;
  if(didDrag || !hoveredHex) return

  const state = clientNetState.state;
  const me = clientNetState.playerId;
  if (!state || !me) return;

  // HQ placement mode - with local checks
  if (state.phase === "HQ_PLACEMENT") {
    const targetTile = state.tiles.get(`${hoveredHex.q},${hoveredHex.r}`);
    if (!targetTile) return;

    // 1. Enforce terrain restrictions
    if (targetTile.terrain === "BEDROCK" || targetTile.terrain === "WATER") {
      showActionError(`Cannot place HQ on ${targetTile.terrain.toLowerCase()} tile.`);
      return;
    }

    // 2. Enforce ownership and distance restrictions
    for (const [otherPlayerId, oldHQLocation] of state.HQLocations.entries()) {
      if (otherPlayerId === me) continue; // Skip checking against yourself
      
      const distance = getHexDistance(hoveredHex.q, hoveredHex.r, oldHQLocation.q, oldHQLocation.r);
      if (distance < MIN_HQ_DISTANCE) {
        showActionError(`Too close to an enemy HQ! Must be at least ${MIN_HQ_DISTANCE - 1} tiles away.`);
        return;
      }
    }
    sendIntent({
      type: "PLACE_HQ",
      q: hoveredHex.q,
      r: hoveredHex.r
    });
    return; 
  }

  // Special attack mode - with local checks
  const activeSpecialAttack = clientUIState.selectedSpecialAttack;
  if (activeSpecialAttack) {
    const tile = clientNetState.state?.tiles.get(`${hoveredHex.q},${hoveredHex.r}`);
    const mePlayer = state.players.get(me);
    if (!tile || !mePlayer) {
      clearSiegeAttackMode();
      return;
    }

    if (tile.building === "HQ") {
      showActionError("HQ tiles cannot be targeted by this siege attack.");
      clearSiegeAttackMode();
      return;
    }

    const attackCost = getEffectiveGoldCost(mePlayer, SPECIAL_ATTACK_COSTS[activeSpecialAttack]);
    if (mePlayer.gold < attackCost) {
      showActionError(`Not enough gold to use ${activeSpecialAttack}. You need ${attackCost} gold.`);
      clearSiegeAttackMode();
      return;
    }

    if (activeSpecialAttack === "BOMBARD") {
      if (tile.terrain === "BEDROCK" || tile.terrain === "WATER") {
        showActionError(`Cannot target ${tile.terrain.toLowerCase()} tile with Bombard.`);
        clearSiegeAttackMode();
        return;
      }
      if ( tile.effects.some((effect) => effect.type === "BROKEN_GROUND")) {
        showActionError("This tile already has broken ground.");
        clearSiegeAttackMode();
        return;
      }
    }

    if (activeSpecialAttack === "PLAGUE_BOMB") {
      if (tile.terrain === "BEDROCK" || tile.terrain === "WATER") {
        showActionError(`Cannot target ${tile.terrain.toLowerCase()} tile with Plague Bomb.`);
        clearSiegeAttackMode();
        return;
      }
      if (!tile.ownerId || tile.ownerId === me) {
        showActionError("Plague bombs must target an enemy-owned tile.");
        clearSiegeAttackMode();
        return;
      }
      if (tile.building || tile.buildingAction) {
        showActionError("Plague bombs cannot target tiles with buildings.");
        clearSiegeAttackMode();
        return;
      }
      if (tile.effects.some((effect) => effect.type === "PLAGUED")) {
        showActionError("This tile is already plagued.");
        clearSiegeAttackMode();
        return;
      }
    }

    const connectedTiles = connectedByPlayer.get(me) ?? new Set<string>();
    const attackRange = SPECIAL_ATTACK_RANGES[activeSpecialAttack];
    let hasSourceInRange = false;

    for (const sourceTile of state.tiles.values()) {
      if (sourceTile.ownerId !== me) continue;
      if (sourceTile.building !== "SIEGE_OUTPOST") continue;
      if (!connectedTiles.has(`${sourceTile.q},${sourceTile.r}`)) continue;

      if (getHexDistance(sourceTile.q, sourceTile.r, hoveredHex.q, hoveredHex.r) <= attackRange) {
        hasSourceInRange = true;
        break;
      }
    }

    if (!hasSourceInRange) {
      showActionError(`Target is outside Siege Outpost range (${attackRange} tiles).`);
      clearSiegeAttackMode();
      return;
    }

    sendIntent({
      type: "SPECIAL_ATTACK",
      attackType: activeSpecialAttack,
      q: hoveredHex.q,
      r: hoveredHex.r
    });
    clearSiegeAttackMode();
    return;
  }

  // ability select mode - with local checks
  const activeAbility = clientUIState.selectedAbility;
  if (activeAbility) {
    const tile = clientNetState.state?.tiles.get(`${hoveredHex.q},${hoveredHex.r}`);

    if (tile) {
      if (!tile.ownerId) {
        showActionError("Cannot target a neutral tile with this ability.");
        clearAbilityMode();
        return; // Stop execution if the tile is unowned
      }
      
      sendIntent({
        type: "BUY_PLAYER_EFFECT",
        effectType: activeAbility,
        targetPlayerId: tile.ownerId
      }); 
    }

    clearAbilityMode();
    return;
  }

  // BUILD MODE ACTIVE - with local checks
  const selected = clientUIState.selectedBuilding;
  if (selected) {
    const tile = clientNetState.state?.tiles.get(
      `${hoveredHex.q},${hoveredHex.r}`
    );

    if (tile) {
      if (tile.ownerId !== clientNetState.playerId) {
        showActionError("You can only build on your own tiles.");
        clearBuildMode();
        return;
      }

      if (tile.building) {
        showActionError("This tile already has a building on it.");
        clearBuildMode();
        return;
      }

      if (tile.effects.some((effect) => effect.type === "BROKEN_GROUND")) {
        showActionError("Cannot build on broken ground.");
        clearBuildMode();
        return;
      }

      sendIntent({
        type: "BUILD",
        q: hoveredHex.q,
        r: hoveredHex.r,
        buildingType: selected
      });
    }

    // Either way, cancel build mode after click
    clearBuildMode();
    return;
  }

  // DEFEND / CAPTURE MODE
  const tile = state.tiles.get(`${hoveredHex.q},${hoveredHex.r}`);
  if (!tile) return;

  const mePlayer = state.players.get(me);
  if (!mePlayer) return;

  // Defense - with local checks
  if (tile.ownerId === me && tile.capture && tile.capture.by !== me) {
    const cost = Math.ceil(tile.capture.cost * (DEFEND_COST_RATIO + (tile.defenseHeat * DEFENSE_COST_INCREMENT)));
    if (mePlayer.army < cost) {
      showActionError("Not enough army to defend this tile. You need at least " + cost + " army.");
      return;
    }

    sendIntent({
      type: "DEFEND",
      q: hoveredHex.q,
      r: hoveredHex.r
    });
    return;
  }

  // Capture mode - with local checks
  if (tile.ownerId !== me) {
    if (tile.terrain === "BEDROCK" || tile.terrain === "WATER") {
      showActionError(`Cannot capture ${tile.terrain.toLowerCase()} tile.`);
      return; // Cannot capture these terrains
    }

    if (tile.capture) {
      showActionError("This tile is already under capture.");
      return; // Cannot capture a tile already under capture
    }

    if (!mePlayer || mePlayer.army < tile.defense * BASE_CAPTURE_COST) {
      showActionError("Not enough army to capture this tile. You need at least " + (tile.defense * BASE_CAPTURE_COST) + " army.");
      return;
    }

    sendIntent({ type: "CAPTURE", q: hoveredHex.q, r: hoveredHex.r });
  }
});

// demolish building
canvas.addEventListener("mousedown", (e) => {
  if (clientUIState.phase !== "PLAYING") return;
  if (e.button !== 2) return
  if (!hoveredHex) return;

  const state = clientNetState.state;
  const me = clientNetState.playerId;
  if (!state || !me) return;

  const tile = state.tiles.get(
    `${hoveredHex.q},${hoveredHex.r}`
  );

  if (
    tile &&
    tile.ownerId === me &&
    tile.building &&
    tile.building !== "HQ"
  ) {
    sendIntent({
      type: "DEMOLISH",
      q: hoveredHex.q,
      r: hoveredHex.r
    });
  }
});

window.addEventListener("mouseup", () => {
  mouseDownPos = null;
});

let lastFrameTime = performance.now();
export let deltaTime = 0;
let targetFps = loadSettings().fpsLimit;
let frameDuration = 1000 / targetFps;
onSettingsChanged((settings) => {
  targetFps = settings.fpsLimit;
  frameDuration = 1000 / targetFps;
});

function loop() {
  requestAnimationFrame(loop);

  const currentTime = performance.now();
  const elapsed = currentTime - lastFrameTime;

  if (elapsed < frameDuration) {
    return; 
  }

  deltaTime = elapsed / 1000;
  lastFrameTime = currentTime - (elapsed % frameDuration);

  if (clientUIState.phase !== "GAME_OVER") {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  const state = clientNetState.state as CoreGameState | null;
  const me = clientNetState.playerId;

  updatePlacementTimerUI(state);
  updateBuildButtons(state, me, myPlannedBuildingCounts);

  const canRenderMap =
    state &&
    me &&
    (clientUIState.phase === "PLAYING" ||
     clientUIState.phase === "GAME_OVER");

  if (!canRenderMap) 
    return;
    
  ctx.fillStyle = "#0c0c0cff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (state && me) {
    const halfW = canvas.width / 2;
    const halfH = canvas.height / 2;
    const cullRadius = HEX_SIZE * camera.zoom * 2.0;

    const visibleTiles: any[] = [];

    for (const tile of state.tiles.values()) {
      const worldX = HEX_SIZE * (Math.sqrt(3) * tile.q + (Math.sqrt(3) / 2) * tile.r);
      const worldY = HEX_SIZE * (1.5 * tile.r); 
      const x = (worldX - camera.x) * camera.zoom + halfW;
      const y = (worldY - camera.y) * camera.zoom + halfH;

      if (x < -cullRadius || x > canvas.width + cullRadius || y < -cullRadius || y > canvas.height + cullRadius) {
        continue;
      }

      const owner = tile.ownerId;
      let isCutOff = false;
      const hovered = (tile.q === hoveredHex?.q && tile.r === hoveredHex?.r);

      if (owner) {
        const connected = connectedByPlayer.get(owner);
        if (connected && !connected.has(`${tile.q},${tile.r}`)) {
          isCutOff = true;
        }
      }

      const { color, fillAlpha } = getTileColor(
        tile,
        hovered,
        state,
        me,
        isCutOff,
        connectedByPlayer
      );
      
      const isTileHovered = (hoveredHex?.q === tile.q && hoveredHex?.r === tile.r);

      let captureColor = "#fff";
      if (tile.capture) {
        const attacker = state.players.get(tile.capture.by);
        captureColor = attacker?.color ?? "#fff";
      }

      const ownerSkinId = owner ? state.players.get(owner)?.skinId ?? null : null;

      visibleTiles.push({
        tile,
        x,
        y,
        worldX,
        worldY,
        color,
        fillAlpha,
        isHovered: isTileHovered,
        captureColor,
        ownerSkinId
      });
    }

    // High-performance batched pipeline execution passes
    drawHexBatch(ctx, visibleTiles, HEX_SIZE);
    drawHexEffectsBatch(ctx, visibleTiles, HEX_SIZE);
    drawBuildingsBatch(ctx, visibleTiles, HEX_SIZE);
    
    drawBuildingProgressBarsBatch(ctx, visibleTiles, HEX_SIZE);
    drawCaptureHexBatch(ctx, visibleTiles, HEX_SIZE, deltaTime);
    drawWaterAttackPaths(ctx, state);
    if (camera.zoom > 0.80) {
      drawHexTextBatch(ctx, visibleTiles, HEX_SIZE);
      drawPlayerEffectIconsBatch(ctx, visibleTiles, HEX_SIZE, state);
    }
    drawProjectiles(ctx);

    if (hoveredHex) {
      const hoveredTile = state.tiles.get(`${hoveredHex.q},${hoveredHex.r}`);
      if (hoveredTile && !state.gameOver) {
        drawTileInfo(ctx, hoveredTile, state, me);
      }
    }
  }

  drawHUD(ctx); 
  drawTargetingHUD(ctx);
  drawGameLogs(ctx);
}

loop();
