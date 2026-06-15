import type { Settings } from "./types";

const KEYS = { settings: "settings" } as const;

const DEFAULT_SETTINGS: Settings = {
  provider: "anthropic",
  model: "claude-haiku-4-5-20251001",
  apiKey: undefined,
  proxyUrl: undefined,
  hotkeyEnabled: true,
  defaultMode: "refine",
  theme: "violet",
};

export async function loadSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(result[KEYS.settings] ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await loadSettings();
  await chrome.storage.local.set({ [KEYS.settings]: { ...current, ...patch } });
}
