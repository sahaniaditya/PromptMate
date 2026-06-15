import { loadSettings, saveSettings } from "../shared/storage";
import { ENHANCE_PORT } from "../shared/messages";
import type { WorkerToContent } from "../shared/messages";
import type {
  EnhanceMode,
  GenerateParams,
  ProviderKind,
  PromptLength,
  PromptTone,
  PromptType,
} from "../shared/types";

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
  ($("defaultMode") as HTMLSelectElement).value = s.defaultMode;

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
  const defaultMode = ($("defaultMode") as HTMLSelectElement).value as EnhanceMode;

  if (!model) {
    showStatus("Model name is required.", true);
    return;
  }

  await saveSettings({ provider, model, apiKey: apiKey || undefined, hotkeyEnabled, defaultMode });
  showStatus("Settings saved.");
});

$("reset").addEventListener("click", async () => {
  await chrome.storage.local.remove("settings");
  await load();
  showStatus("Reset to defaults.");
});

// ── Tabs ─────────────────────────────────────────────────────────────────────

document.querySelectorAll<HTMLButtonElement>(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const panelId = tab.dataset.panel;
    if (!panelId) return;
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(panelId)?.classList.add("active");
  });
});

// ── Craft a prompt (generation) ──────────────────────────────────────────────

function showGenStatus(msg: string, isError = false): void {
  const el = $("genStatus");
  el.textContent = msg;
  el.className = isError ? "error visible" : "visible";
  if (!isError) setTimeout(() => el.classList.remove("visible"), 2500);
}

let generating = false;
let generated = "";

$("genBtn").addEventListener("click", () => {
  if (generating) return;

  const description = ($("genDescription") as HTMLTextAreaElement).value.trim();
  if (!description) {
    showGenStatus("Describe what the prompt should be about.", true);
    return;
  }

  const params: GenerateParams = {
    description,
    promptType: ($("genType") as HTMLSelectElement).value as PromptType,
    length: ($("genLength") as HTMLSelectElement).value as PromptLength,
    tone: ($("genTone") as HTMLSelectElement).value as PromptTone,
  };

  generating = true;
  generated = "";
  const btn = $("genBtn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "Generating…";
  showGenStatus("");
  $("genStatus").classList.remove("visible");

  const outputWrap = $("genOutputWrap");
  const output = $("genOutput");
  output.textContent = "";
  outputWrap.classList.add("visible");

  const finish = () => {
    generating = false;
    btn.disabled = false;
    btn.textContent = "Generate prompt";
  };

  const port = chrome.runtime.connect({ name: ENHANCE_PORT });
  port.onMessage.addListener((msg: WorkerToContent) => {
    switch (msg.type) {
      case "STREAM_DELTA":
        generated += msg.text;
        output.textContent = generated;
        break;
      case "DONE":
        generated = msg.text;
        output.textContent = generated;
        finish();
        port.disconnect();
        break;
      case "ERROR":
        finish();
        port.disconnect();
        outputWrap.classList.remove("visible");
        showGenStatus(
          msg.code === "NO_KEY" ? "Set your API key above first." : "Couldn't generate. Try again.",
          true,
        );
        break;
    }
  });

  port.postMessage({ type: "GENERATE_REQUEST", params });
});

$("genCopy").addEventListener("click", async () => {
  if (!generated) return;
  const btn = $("genCopy");
  try {
    await navigator.clipboard.writeText(generated);
    btn.classList.add("copied");
    btn.setAttribute("title", "Copied!");
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.setAttribute("title", "Copy to clipboard");
    }, 1500);
  } catch {
    showGenStatus("Couldn't copy.", true);
  }
});

load().catch(console.error);
