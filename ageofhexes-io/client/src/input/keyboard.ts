import { toggleBuildMode, clearBuildMode } from "../ui/buildMode.js";
import { toggleAbilityMode, clearAbilityMode } from "../ui/abilityMode.js";
import { toggleSiegeAttackMode, clearSiegeAttackMode } from "../ui/siegeAttackMode.js";
import { loadSettings, onSettingsChanged, type Keybinds } from "./settings.js";

let keybinds: Keybinds = loadSettings().keybinds;
onSettingsChanged((settings) => { keybinds = settings.keybinds; });

export function initKeyboard() {
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;

    const key = e.key.toLowerCase();

    if (key === keybinds.buildFort.toLowerCase()) toggleBuildMode("FORT");
    if (key === keybinds.buildBarracks.toLowerCase()) toggleBuildMode("BARRACKS");
    if (key === keybinds.buildHouse.toLowerCase()) toggleBuildMode("HOUSE");
    if (key === keybinds.buildLaboratory.toLowerCase()) toggleBuildMode("LABORATORY");
    if (key === keybinds.buildHarbor.toLowerCase()) toggleBuildMode("HARBOR");
    if (key === keybinds.buildSiegeOutpost.toLowerCase()) toggleBuildMode("SIEGE_OUTPOST")

    if (key === keybinds.useAttackSpeedAbility.toLowerCase()) toggleAbilityMode("ATTACK_SPEED")
    if (key === keybinds.useArmyGainBuffAbility.toLowerCase()) toggleAbilityMode("ARMY_GAIN_BUFF")
    if (key === keybinds.useHyperinflationAbility.toLowerCase()) toggleAbilityMode("HYPERINFLATION")
    
    if (key === keybinds.useBombardSiegeAttack.toLowerCase()) toggleSiegeAttackMode("BOMBARD")
    if (key === keybinds.usePlagueBombSiegeAttack.toLowerCase()) toggleSiegeAttackMode("PLAGUE_BOMB")

    if (e.key === "Escape") {
      clearBuildMode();
      clearAbilityMode();
      clearSiegeAttackMode();
    }
  });
}
