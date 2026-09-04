// Keybind settings

export interface Keybinds {
    buildFort: string;
    buildBarracks: string;
    buildHouse: string;
    buildLaboratory: string;
    buildHarbor: string;
    buildSiegeOutpost: string;
    useAttackSpeedAbility: string;
    useArmyGainBuffAbility: string;
    useHyperinflationAbility: string;
    useBombardSiegeAttack: string;
    usePlagueBombSiegeAttack: string;
}

export const DEFAULT_KEYBINDS: Keybinds = {
    buildFort: "1",
    buildBarracks: "2",
    buildHouse: "3",
    buildLaboratory: "4",
    buildHarbor: "5",
    buildSiegeOutpost: "6",
    useAttackSpeedAbility: "e",
    useArmyGainBuffAbility: "r",    
    useHyperinflationAbility: "t",
    useBombardSiegeAttack: "q",
    usePlagueBombSiegeAttack: "w"
};

export const DEFAULT_FPS = 60;

export interface Settings {
    keybinds: Keybinds;
    fpsLimit: number;
}

const STORAGE_KEY = "ageofhexes_settings";

function getDefaultSettings(): Settings {
    return { keybinds: { ...DEFAULT_KEYBINDS }, fpsLimit: DEFAULT_FPS };
}

export function loadSettings(): Settings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            const defaults = getDefaultSettings();
            saveSettings(defaults);
            return defaults;
        }
        const parsed = JSON.parse(raw);
        return {
            keybinds: { ...DEFAULT_KEYBINDS, ...(parsed.keybinds ?? {}) },
            fpsLimit: typeof parsed.fpsLimit === "number" && parsed.fpsLimit > 0 ? parsed.fpsLimit : DEFAULT_FPS
        };
    } catch {
        return getDefaultSettings();
    }
}

export function saveSettings(settings: Settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

type SettingsListener = (settings: Settings) => void;
const listeners = new Set<SettingsListener>();

export function onSettingsChanged(listener: SettingsListener) {
    listeners.add(listener);
}

export function updateSettings(settings: Settings) {
    saveSettings(settings);
    for (const listener of listeners) listener(settings);
}