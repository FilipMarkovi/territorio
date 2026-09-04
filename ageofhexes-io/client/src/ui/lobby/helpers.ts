import { PRIVATE_MAP_OPTIONS } from "./constants.js";
import { EQUIPPED_SKIN_STORAGE_KEY, USERNAME_STORAGE_KEY } from "../../../../shared/index.js";
import { DEFAULT_SKIN_ID } from "../../../../shared/storeItems.js";

export function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function getPrivateMapLabel(mapId: string): string {
  return PRIVATE_MAP_OPTIONS.find((opt) => opt.id === mapId)?.label ?? mapId;
}

export function setGuestName(newName: string): void {
  localStorage.setItem(USERNAME_STORAGE_KEY, newName.trim());
}

export function clearGuestName(): void {
  localStorage.removeItem(USERNAME_STORAGE_KEY);
}

export function getOrCreateGuestName(): string {
  // Check if a username is already saved in localStorage
  const savedName = localStorage.getItem(USERNAME_STORAGE_KEY);
  if (savedName) {
    return savedName;
  }

  // generate a new random username if none exists
  const randomId = Math.floor(1000000 + Math.random() * 9000000);
  const newName = `Player_${randomId}`;

  setGuestName(newName);

  return newName;
}

export function getEquippedSkin(): string {
  return localStorage.getItem(EQUIPPED_SKIN_STORAGE_KEY) ?? DEFAULT_SKIN_ID;
}

export function setEquippedSkin(skinId: string): void {
  localStorage.setItem(EQUIPPED_SKIN_STORAGE_KEY, skinId);
}
