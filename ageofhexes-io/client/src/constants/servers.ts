export interface ServerOption {
  id: string;
  label: string;
  host: string;
}

// To add a new server region, just append another entry here.
export const SERVER_OPTIONS: ServerOption[] = [
  { id: "eu-central", label: "EU Central", host: "eu.ageofhexes.io" },
  { id: "us-east", label: "US East", host: "us.ageofhexes.io" },
];

export const DEFAULT_SERVER_ID = "eu-central";

const SELECTED_SERVER_STORAGE_KEY = "aoh_selected_server_id";

export function getSelectedServerId(): string {
  const stored = localStorage.getItem(SELECTED_SERVER_STORAGE_KEY);
  if (stored && SERVER_OPTIONS.some((opt) => opt.id === stored)) {
    return stored;
  }
  return DEFAULT_SERVER_ID;
}

export function setSelectedServerId(id: string) {
  if (!SERVER_OPTIONS.some((opt) => opt.id === id)) return;
  localStorage.setItem(SELECTED_SERVER_STORAGE_KEY, id);
}

export function getSelectedServerHost(): string {
  const id = getSelectedServerId();
  return SERVER_OPTIONS.find((opt) => opt.id === id)?.host
    ?? SERVER_OPTIONS.find((opt) => opt.id === DEFAULT_SERVER_ID)!.host;
}
