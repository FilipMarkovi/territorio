import type { CoreGameState, PlayerId, BuildingType, PlayerEffectType, SiegeAttackType } from "../../../shared/index.js";
import { BUILDING_COST, BUILDING_LIMIT, DEMOLISH_REFUND_RATIO, EFFECT_COSTS, EFFECT_DURATIONS, SPECIAL_ATTACK_COSTS, SPECIAL_ATTACK_RANGES } from "../../../shared/constants.js";
import { getEffectiveGoldCost, hasHyperinflation } from "../../../shared/util.js";
import { clientUIState, clientNetState } from "../state/clientState.js";
import { toggleBuildMode } from "./buildMode.js";
import { toggleAbilityMode } from "./abilityMode.js";
import { toggleSiegeAttackMode } from "./siegeAttackMode.js";
import { loadSettings, onSettingsChanged, type Keybinds } from "../input/settings.js";

let keybinds: Keybinds = loadSettings().keybinds;
onSettingsChanged((settings) => { keybinds = settings.keybinds; });

type BtnDef = {
  type: BuildingType;
  key: string;
  label: string;
  cost: number;
  limit: number;
  description: string;
};

const defs: BtnDef[] = [
  { type: "FORT", key: keybinds.buildFort, label: `Fort`, cost: BUILDING_COST["FORT"], limit: BUILDING_LIMIT["FORT"], description: "Increases defense of nearby tiles." },
  { type: "BARRACKS", key: keybinds.buildBarracks, label: "Barracks", cost: BUILDING_COST["BARRACKS"], limit: BUILDING_LIMIT["BARRACKS"], description: "Increases production rate of army." },
  { type: "HOUSE", key: keybinds.buildHouse, label: "House", cost: BUILDING_COST["HOUSE"], limit: BUILDING_LIMIT["HOUSE"], description: "Increases maximum population size." },
  { type: "LABORATORY", key: keybinds.buildLaboratory, label: "Laboratory", cost: BUILDING_COST["LABORATORY"], limit: BUILDING_LIMIT["LABORATORY"], description: "Unlocks ability to buy buffs and debuffs." },
  { type: "HARBOR", key: keybinds.buildHarbor, label: "Harbor", cost: BUILDING_COST["HARBOR"], limit: BUILDING_LIMIT["HARBOR"], description: "Enables attacks across water.\nMust be built next to water." },
  { type: "SIEGE_OUTPOST", key: keybinds.buildSiegeOutpost, label: "Siege Outpost", cost: BUILDING_COST["SIEGE_OUTPOST"], limit: BUILDING_LIMIT["SIEGE_OUTPOST"], description: "Offense oriented building that grants the ability to use special attacks within its range." },
];

type ResearchDef = {
  type: PlayerEffectType;
  key: string;
  label: string;
  cost: number;
  description: string;
  isBuff: boolean;
};

const researchDefs: ResearchDef[] = [
  { 
    type: "ATTACK_SPEED", 
    key: keybinds.useAttackSpeedAbility, 
    label: "Blitz Attacks", 
    cost: EFFECT_COSTS["ATTACK_SPEED"],
    description: "Instantly injects an adrenaline buff boosting tile capture speeds by 50%.",
    isBuff: true
  },
  {
    type: "ARMY_GAIN_BUFF", 
    key: keybinds.useArmyGainBuffAbility,
    label: "Overclock",
    cost: EFFECT_COSTS["ARMY_GAIN_BUFF"],
    description: `Boost army production by 2x for ${EFFECT_DURATIONS["ARMY_GAIN_BUFF"] / 2000}s, followed by an immediate 0.5x burnout crash for ${EFFECT_DURATIONS["ARMY_GAIN_BUFF"] / 2000}s.`,
    isBuff: true
  },
  {
    type: "HYPERINFLATION",
    key: keybinds.useHyperinflationAbility,
    label: "Hyperinflation",
    cost: EFFECT_COSTS["HYPERINFLATION"],
    description: `Target player pays 50% more gold for all purchases for ${EFFECT_DURATIONS["HYPERINFLATION"] / 1000}s.`,
    isBuff: false
  }
];

type SiegeAttackDef = {
  type: SiegeAttackType;
  key: string;
  label: string;
  cost: number;
  range: number;
  description: string;
};

const siegeAttackDefs: SiegeAttackDef[] = [
  {
    type: "BOMBARD",
    key: keybinds.useBombardSiegeAttack,
    label: "Bombard",
    cost: SPECIAL_ATTACK_COSTS.BOMBARD,
    range: SPECIAL_ATTACK_RANGES.BOMBARD,
    description: "Destroys any non-HQ building on target tile and permanently applies BROKEN GROUND.",
  },
  {
    type: "PLAGUE_BOMB",
    key: keybinds.usePlagueBombSiegeAttack,
    label: "Plague Bomb",
    cost: SPECIAL_ATTACK_COSTS.PLAGUE_BOMB,
    range: SPECIAL_ATTACK_RANGES.PLAGUE_BOMB,
    description: "Turns an enemy tile neutral, applies PLAGUED, and spawns a plague source that spreads infection over time.",
  },
];

const btnByType = new Map<BuildingType, HTMLButtonElement>();
const researchBtnByType = new Map<PlayerEffectType, HTMLButtonElement>();
const siegeAttackBtnByType = new Map<SiegeAttackType, HTMLButtonElement>();

let latestPlannedBuildingCounts: Record<string, number> = {};
let tooltipRefreshTimer: number | null = null;

const groupOpenState = {
  buildings: false,
  research: false,
  siege: false,
};

type MenuGroupKey = "buildings" | "research" | "siege";

type MenuGroupRefs = {
  root: HTMLDivElement;
  toggle: HTMLButtonElement;
  panel: HTMLDivElement;
};

const menuGroups = new Map<MenuGroupKey, MenuGroupRefs>();

function stopTooltipRefresh() {
  if (tooltipRefreshTimer !== null) {
    window.clearInterval(tooltipRefreshTimer);
    tooltipRefreshTimer = null;
  }
}

function startTooltipRefresh(render: () => void) {
  stopTooltipRefresh();
  render();
  tooltipRefreshTimer = window.setInterval(render, 140);
}

function getTooltipCostStyle() {
  const state = clientNetState.state;
  const me = clientNetState.playerId;
  const mePlayer = state && me ? state.players.get(me) : null;
  const inflated = hasHyperinflation(mePlayer);

  return {
    mePlayer,
    inflated,
    color: inflated ? "#ef4444" : "#facc15",
  };
}

function getIconPath(itemType: string) {
  return `/assets/${itemType.toLowerCase()}_icon.png`;
}

function getIconCandidates(itemType: string) {
  const base = itemType.toLowerCase();
  const aliases: Record<string, string[]> = {
    barracks: ["brracks_icon", "brracks"],
    hyperinflation: ["hiperinflation_icon", "hiperinflation"],
  };

  const names = [
    `${base}_icon`,
    base,
    ...(aliases[base] ?? []),
  ];

  return Array.from(new Set(names)).map(name => `/assets/${name}.png`);
}

function createIconButton(iconType: string, title: string) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.title = title;
  btn.setAttribute("aria-label", title);

  Object.assign(btn.style, {
    width: "38px", // Reduced from 46px
    height: "38px", // Reduced from 46px
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.25)",
    background: "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.15), rgba(10,10,20,0.65))",
    boxShadow: "0 3px 10px rgba(0,0,0,0.35)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    cursor: "pointer",
    transition: "transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease, outline-color 120ms ease",
  });

  const iconCandidates = getIconCandidates(iconType);
  let candidateIndex = 0;

  const img = document.createElement("img");
  img.src = iconCandidates[candidateIndex] ?? getIconPath(iconType);
  img.alt = title;
  img.draggable = false;

  Object.assign(img.style, {
    display: "block",
    flexShrink: "0",
    margin: "0 auto",
    width: "28px", // Reduced from 34px
    height: "28px", // Reduced from 34px
    objectFit: "contain",
    pointerEvents: "none",
    userSelect: "none",
  });

  const fallbackText = document.createElement("span");
  fallbackText.textContent = title.slice(0, 2).toUpperCase();
  Object.assign(fallbackText.style, {
    display: "none",
    color: "#e2e8f0",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.04em",
    pointerEvents: "none",
  });

  img.onerror = () => {
    candidateIndex += 1;
    if (candidateIndex < iconCandidates.length) {
      img.src = iconCandidates[candidateIndex];
      return;
    }

    img.style.display = "none";
    fallbackText.style.display = "block";
  };

  btn.appendChild(img);
  btn.appendChild(fallbackText);
  return btn;
}

function setPanelOpen(panel: HTMLDivElement, open: boolean) {
  panel.style.maxWidth = open ? "540px" : "0px";
  panel.style.opacity = open ? "1" : "0";
  panel.style.transform = open ? "scaleX(1)" : "scaleX(0.82)";
  panel.style.pointerEvents = open ? "auto" : "none";
}

function updateGroupToggleLabel(toggle: HTMLButtonElement, label: string, open: boolean) {
  toggle.textContent = `${open ? "▾" : "▸"} ${label}`;
}

function positionTooltipAboveButton(tooltip: HTMLDivElement, btn: HTMLButtonElement) {
  const btnRect = btn.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const margin = 8;

  const centeredLeft = btnRect.left + scrollX + btnRect.width / 2 - tooltip.offsetWidth / 2;
  const minLeft = scrollX + margin;
  const maxLeft = scrollX + window.innerWidth - tooltip.offsetWidth - margin;
  const clampedLeft = Math.max(minLeft, Math.min(centeredLeft, maxLeft));

  const aboveTop = btnRect.top + scrollY - tooltip.offsetHeight - 10;
  const belowTop = btnRect.bottom + scrollY + 10;
  const top = aboveTop < scrollY + margin ? belowTop : aboveTop;

  tooltip.style.left = `${clampedLeft}px`;
  tooltip.style.top = `${top}px`;
}

function createMenuGroup(key: MenuGroupKey, bottomPx: number, label: string) {
  const themeByKey: Record<MenuGroupKey, { border: string; bg: string; pill: string }> = {
    buildings: {
      border: "rgba(96, 165, 250, 0.32)",
      bg: "linear-gradient(135deg, rgba(10, 24, 48, 0.8), rgba(12, 16, 28, 0.78))",
      pill: "rgba(30, 64, 175, 0.38)",
    },
    research: {
      border: "rgba(216, 180, 254, 0.32)",
      bg: "linear-gradient(135deg, rgba(40, 18, 68, 0.8), rgba(20, 12, 36, 0.78))",
      pill: "rgba(126, 34, 206, 0.36)",
    },
    siege: {
      border: "rgba(251, 146, 60, 0.32)",
      bg: "linear-gradient(135deg, rgba(74, 30, 12, 0.8), rgba(28, 16, 12, 0.8))",
      pill: "rgba(180, 83, 9, 0.38)",
    },
  };

  const theme = themeByKey[key];

  const root = document.createElement("div");
  root.id = `${key}-group`;
  Object.assign(root.style, {
    position: "absolute",
    left: "16px",
    bottom: `${bottomPx}px`,
    display: "flex",
    alignItems: "center",
    gap: "8px",
    zIndex: "12",
    padding: "4px 8px", // Reduced padding from 8px 10px
    borderRadius: "14px",
    border: `1px solid ${theme.border}`,
    background: theme.bg,
    boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
    backdropFilter: "blur(3px)",
  });

  const toggle = document.createElement("button");
  toggle.type = "button";
  Object.assign(toggle.style, {
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.28)",
    background: theme.pill,
    color: "#f8fafc",
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "0.02em",
    padding: "5px 10px", // Reduced padding from 7px 11px
    cursor: "pointer",
    width: "105px",
    textAlign: "left",
    boxShadow: "0 3px 10px rgba(0,0,0,0.3)",
  });
  updateGroupToggleLabel(toggle, label, groupOpenState[key]);

  const panel = document.createElement("div");
  panel.id = `${key}-ui`;
  Object.assign(panel.style, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    overflowX: "hidden",
    overflowY: "visible",
    padding: "2px 1px",
    transformOrigin: "left center",
    transition: "max-width 220ms ease, opacity 160ms ease, transform 220ms ease",
  });
  setPanelOpen(panel, groupOpenState[key]);

  toggle.onclick = () => {
    groupOpenState[key] = !groupOpenState[key];
    setPanelOpen(panel, groupOpenState[key]);
    updateGroupToggleLabel(toggle, label, groupOpenState[key]);
  };

  root.appendChild(toggle);
  root.appendChild(panel);
  document.body.appendChild(root);

  menuGroups.set(key, { root, toggle, panel });
  return panel;
}

export function initBuildButtons() {
  // Spaced at 16px, 72px, and 128px (56px interval with 46px menu height leaving a clean 10px gap)
  const container = createMenuGroup("buildings", 16, "Build");
  const researchContainer = createMenuGroup("research", 72, "Research");
  const siegeContainer = createMenuGroup("siege", 128, "Attacks");

  // TOOLTIP STRUCTURE
  const tooltip = document.createElement("div");
  tooltip.id = "build-tooltip";
  Object.assign(tooltip.style, {
    position: "absolute",
    top: "0px",
    left: "0px",
    background: "rgba(10, 15, 30, 0.95)",
    color: "white",
    padding: "10px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    lineHeight: "1.35",
    maxWidth: "260px",
    pointerEvents: "none",
    display: "none",
    zIndex: "100",
    border: "1px solid rgba(147, 51, 234, 0.3)",
    boxShadow: "0 10px 25px rgba(0, 0, 0, 0.45)",
  });
  document.body.appendChild(tooltip);

  // --- GENERATE BUILD BUTTONS ---
  for (const d of defs) {
    const btn = createIconButton(d.type, d.label);

    btn.onclick = () => toggleBuildMode(d.type);

    btn.onmousedown = () => {
      btn.style.transform = "translateY(1px) scale(0.98)";
    };
    btn.onmouseup = () => {
      btn.style.transform = "translateY(0px) scale(1)";
    };

    btn.onmouseenter = () => {
      tooltip.style.display = "block";
      tooltip.style.visibility = "hidden";
      startTooltipRefresh(() => {
        const { mePlayer, color } = getTooltipCostStyle();
        const effectiveCost = getEffectiveGoldCost(mePlayer, d.cost);
        const state = clientNetState.state;
        const me = clientNetState.playerId;
        const meBuildings = state && me ? state.players.get(me)?.buildings : null;
        const currentCount = meBuildings
          ? (meBuildings[d.type.toLowerCase() as keyof typeof meBuildings] ?? 0)
          : 0;
        const plannedCount = latestPlannedBuildingCounts[d.type.toLowerCase()] ?? currentCount;

        tooltip.innerHTML = `
          <div style="font-weight: 700; color: #facc15; margin-bottom: 4px;">${d.label}</div>
          <div style="font-size: 11px; color: #cbd5e1; margin-bottom: 4px;">Key: ${d.key}</div>
          <div style="font-size: 11px; margin-bottom: 4px;">
            <span style="color: ${color}; font-weight: 600;">Cost: ${effectiveCost} gold</span>
          </div>
          <div style="font-size: 11px; color: #a5b4fc; margin-bottom: 6px;">Limit: ${plannedCount}/${d.limit}</div>
          <div style="opacity: 0.92; margin-bottom: 6px;">${d.description}</div>
          <div style="font-size: 10px; color: #94a3b8;">Demolish refund: ${d.cost * DEMOLISH_REFUND_RATIO}g</div>
        `;
        positionTooltipAboveButton(tooltip, btn);
        tooltip.style.visibility = "visible";
      });
    };

    btn.onmouseleave = () => {
      stopTooltipRefresh();
      tooltip.style.display = "none";
      btn.style.transform = "translateY(0px) scale(1)";
    };

    container.appendChild(btn);
    btnByType.set(d.type, btn);
  }

  // --- GENERATE LABORATORY UPGRADE BUTTONS ---
  for (const r of researchDefs) {
    const btn = createIconButton(r.type, r.label);

    btn.onclick = () => {
      if (btn.disabled) return;
      toggleAbilityMode(r.type);
    };

    btn.onmousedown = () => {
      btn.style.transform = "translateY(1px) scale(0.98)";
    };
    btn.onmouseup = () => {
      btn.style.transform = "translateY(0px) scale(1)";
    };

    btn.onmouseenter = () => {
      tooltip.style.display = "block";
      tooltip.style.visibility = "hidden";
      startTooltipRefresh(() => {
        const durationMs = EFFECT_DURATIONS[r.type] ?? 0;
        const durationText = durationMs > 0 ? `${durationMs / 1000}s` : "Permanent";
        const { mePlayer, color } = getTooltipCostStyle();
        const effectiveCost = getEffectiveGoldCost(mePlayer, r.cost);

        tooltip.innerHTML = `
          <div style="font-weight: 700; color: #c084fc; margin-bottom: 4px;">${r.label}</div>
          <div style="font-size: 11px; color: #cbd5e1; margin-bottom: 4px;">Key: ${r.key}</div>
          <div style="display: flex; gap: 12px; font-size: 11px; margin-bottom: 6px;">
            <div style="color: ${color}; font-weight: 600;">Cost: ${effectiveCost} gold</div>
            <div style="color: #a7f3d0; font-weight: 500;">Duration: ${durationText}</div>
          </div>
          <div style="opacity: 0.92;">${r.description}</div>
        `;
        positionTooltipAboveButton(tooltip, btn);
        tooltip.style.visibility = "visible";
      });
    };

    btn.onmouseleave = () => {
      stopTooltipRefresh();
      tooltip.style.display = "none";
      btn.style.transform = "translateY(0px) scale(1)";
    };

    researchContainer.appendChild(btn);
    researchBtnByType.set(r.type, btn);
  }

  // --- GENERATE SIEGE SPECIAL ATTACK BUTTONS ---
  for (const s of siegeAttackDefs) {
    const btn = createIconButton(s.type, s.label);

    btn.onclick = () => {
      if (btn.disabled) return;
      toggleSiegeAttackMode(s.type);
    };

    btn.onmousedown = () => {
      btn.style.transform = "translateY(1px) scale(0.98)";
    };
    btn.onmouseup = () => {
      btn.style.transform = "translateY(0px) scale(1)";
    };

    btn.onmouseenter = () => {
      tooltip.style.display = "block";
      tooltip.style.visibility = "hidden";
      startTooltipRefresh(() => {
        const { mePlayer, color } = getTooltipCostStyle();
        const effectiveCost = getEffectiveGoldCost(mePlayer, s.cost);

        tooltip.innerHTML = `
          <div style="font-weight: 700; color: #fb923c; margin-bottom: 4px;">${s.label}</div>
          <div style="font-size: 11px; color: #cbd5e1; margin-bottom: 4px;">Key: ${s.key}</div>
          <div style="display: flex; gap: 12px; font-size: 11px; margin-bottom: 6px;">
            <div style="color: ${color}; font-weight: 600;">Cost: ${effectiveCost} gold</div>
            <div style="color: #fdba74; font-weight: 500;">Range: ${s.range} hex</div>
          </div>
          <div style="opacity: 0.92;">${s.description}</div>
        `;
        positionTooltipAboveButton(tooltip, btn);
        tooltip.style.visibility = "visible";
      });
    };

    btn.onmouseleave = () => {
      stopTooltipRefresh();
      tooltip.style.display = "none";
      btn.style.transform = "translateY(0px) scale(1)";
    };

    siegeContainer.appendChild(btn);
    siegeAttackBtnByType.set(s.type, btn);
  }
}

export function updateBuildButtons(state: CoreGameState | null, me: PlayerId | null, myPlannedBuildingCounts: Record<string, number>) {
  latestPlannedBuildingCounts = myPlannedBuildingCounts;

  const buildGroup = menuGroups.get("buildings")?.root;
  const researchGroup = menuGroups.get("research")?.root;
  const siegeGroup = menuGroups.get("siege")?.root;
  if (!buildGroup || !researchGroup || !siegeGroup) return;

  if (clientUIState.phase !== "PLAYING" || clientNetState.state?.players.get(me ?? "")?.eliminated) {
    buildGroup.style.display = "none";
    researchGroup.style.display = "none";
    siegeGroup.style.display = "none";
    return;
  }

  buildGroup.style.display = "flex";

  if (!state || !me) return;
  const p = state.players.get(me);
  if (!p) return;

  const hasLaboratory = (p.buildings.laboratory ?? 0) > 0;
  const hasSiegeOutpost = (p.buildings.siege_outpost ?? 0) > 0;
  researchGroup.style.display = hasLaboratory ? "flex" : "none";
  siegeGroup.style.display = hasSiegeOutpost ? "flex" : "none";

  // --- UPDATE BUILD BUTTONS LOGIC ---
  for (const d of defs) {
    const btn = btnByType.get(d.type);
    if (!btn) continue;

    const buildingKey = d.type.toLowerCase();
    
    // FETCH CACHED COUNTS: Completed + Under Construction
    const plannedCount = myPlannedBuildingCounts[buildingKey] ?? 0;
    
    const effectiveCost = getEffectiveGoldCost(p, d.cost);
    const affordable = p.gold >= effectiveCost;
    const selected = clientUIState.selectedBuilding === d.type;
    
    // FIX: Base button validation limits entirely on total footprints!
    const disable = (!affordable || (plannedCount >= d.limit));

    btn.disabled = disable;
    btn.style.opacity = !disable ? "1" : "0.35";
    btn.style.cursor = !disable ? "pointer" : "not-allowed";
    btn.style.boxShadow = selected ? "inset 0 0 0 2px rgba(107,124,255,0.98), 0 3px 10px rgba(0,0,0,0.35)" : "0 3px 10px rgba(0,0,0,0.35)";
  }

  // --- UPDATE LABORATORY ACTION BUTTONS ---
  for (const r of researchDefs) {
    const btn = researchBtnByType.get(r.type);
    if (!btn) continue;

    const effectiveCost = getEffectiveGoldCost(p, r.cost);
    const canAfford = p.gold >= effectiveCost;
    const isLockedOut = !canAfford || !hasLaboratory;
    const isSelected = clientUIState.selectedAbility === r.type;

    btn.disabled = isLockedOut;
    btn.style.background = isLockedOut
      ? "radial-gradient(circle at 30% 25%, rgba(120,120,120,0.08), rgba(20,18,30,0.5))"
      : "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.16), rgba(40,15,70,0.72))";
    btn.style.borderColor = isLockedOut ? "rgba(255,255,255,0.12)" : "rgba(192, 132, 252, 0.75)";

    btn.style.opacity = isLockedOut ? "0.4" : "1";
    btn.style.cursor = isLockedOut ? "not-allowed" : "pointer";

    btn.style.boxShadow = isSelected ? "inset 0 0 0 2px rgba(192,132,252,0.98), 0 3px 10px rgba(0,0,0,0.35)" : "0 3px 10px rgba(0,0,0,0.35)";
  }

  for (const s of siegeAttackDefs) {
    const btn = siegeAttackBtnByType.get(s.type);
    if (!btn) continue;

    const effectiveCost = getEffectiveGoldCost(p, s.cost);
    const canAfford = p.gold >= effectiveCost;
    const isLockedOut = !hasSiegeOutpost || !canAfford;
    const isSelected = clientUIState.selectedSpecialAttack === s.type;

    btn.disabled = isLockedOut;
    btn.style.background = isLockedOut
      ? "radial-gradient(circle at 30% 25%, rgba(120,120,120,0.08), rgba(20,18,30,0.5))"
      : "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.16), rgba(90,35,18,0.75))";
    btn.style.borderColor = isLockedOut ? "rgba(255,255,255,0.12)" : "rgba(251, 146, 60, 0.72)";
    btn.style.opacity = isLockedOut ? "0.4" : "1";
    btn.style.cursor = isLockedOut ? "not-allowed" : "pointer";
    btn.style.boxShadow = isSelected ? "inset 0 0 0 2px rgba(251,146,60,0.98), 0 3px 10px rgba(0,0,0,0.35)" : "0 3px 10px rgba(0,0,0,0.35)";
  }
}