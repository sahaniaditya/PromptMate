import { loadSettings, saveSettings } from "../shared/storage";
import type { ProviderKind } from "../shared/types";

const PROVIDER_MODELS: Record<ProviderKind, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  proxy: "",
};

const PROVIDER_KEY_LINKS: Record<ProviderKind, string> = {
  anthropic: "https://console.anthropic.com/",
  openai: "https://platform.openai.com/api-keys",
  proxy: "#",
};

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

function showStatus(msg: string, isError = false): void {
  const el = $("status");
  el.textContent = msg;
  el.className = isError ? "error visible" : "visible";
  setTimeout(() => el.classList.remove("visible"), 2500);
}

async function load(): Promise<void> {
  const s = await loadSettings();

  ($("provider") as HTMLSelectElement).value = s.provider;
  ($("model") as HTMLInputElement).value = s.model;
  ($("apiKey") as HTMLInputElement).value = s.apiKey ?? "";
  ($("hotkeyEnabled") as HTMLInputElement).checked = s.hotkeyEnabled;
  ($("autoDismiss") as HTMLInputElement).checked = s.autoDismissLeaveAlone;

  updateKeyLink(s.provider);
}

function updateKeyLink(provider: ProviderKind): void {
  const link = $("keyLink") as HTMLAnchorElement;
  link.href = PROVIDER_KEY_LINKS[provider];
  link.textContent =
    provider === "anthropic"
      ? "Get an Anthropic key →"
      : provider === "openai"
        ? "Get an OpenAI key →"
        : "Configure proxy URL";
}

$("provider").addEventListener("change", () => {
  const provider = ($("provider") as HTMLSelectElement).value as ProviderKind;
  const modelInput = $("model") as HTMLInputElement;
  modelInput.value = PROVIDER_MODELS[provider] ?? "";
  updateKeyLink(provider);
});

$("toggleKey").addEventListener("click", () => {
  const input = $("apiKey") as HTMLInputElement;
  input.type = input.type === "password" ? "text" : "password";
});

$("save").addEventListener("click", async () => {
  const provider = ($("provider") as HTMLSelectElement).value as ProviderKind;
  const model = ($("model") as HTMLInputElement).value.trim();
  const apiKey = ($("apiKey") as HTMLInputElement).value.trim();
  const hotkeyEnabled = ($("hotkeyEnabled") as HTMLInputElement).checked;
  const autoDismissLeaveAlone = ($("autoDismiss") as HTMLInputElement).checked;

  if (!model) {
    showStatus("Model name is required.", true);
    return;
  }

  await saveSettings({ provider, model, apiKey: apiKey || undefined, hotkeyEnabled, autoDismissLeaveAlone });
  showStatus("Settings saved.");
});

$("reset").addEventListener("click", async () => {
  await chrome.storage.local.remove("settings");
  await load();
  showStatus("Reset to defaults.");
});

load().catch(console.error);
