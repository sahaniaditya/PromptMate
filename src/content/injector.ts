import type { SiteAdapter } from "./adapters/adapter";
import type { WorkerToContent } from "../shared/messages";
import { ENHANCE_PORT } from "../shared/messages";
import type { EnhanceContext } from "../shared/types";
import { Panel } from "./panel/panel";

let inflight = false;
let panel: Panel | null = null;

function getSelection(): string | undefined {
  const sel = window.getSelection()?.toString().trim();
  return sel || undefined;
}

function onTrigger(adapter: SiteAdapter): void {
  if (inflight) return;

  const input = adapter.findInput();
  if (!input) return;

  const prompt = adapter.readPrompt(input).trim();
  if (!prompt) return;

  const ctx: EnhanceContext = {
    prompt,
    selection: getSelection(),
    siteId: adapter.id,
  };

  inflight = true;

  // Ensure panel exists and show spinner
  if (!panel) panel = new Panel();
  panel.showLoading();

  const port = chrome.runtime.connect({ name: ENHANCE_PORT });

  port.onMessage.addListener((msg: WorkerToContent) => {
    switch (msg.type) {
      case "STREAM_START":
        // Spinner is already showing
        break;

      case "STREAM_DELTA":
        panel!.onDelta(msg.text);
        break;

      case "RESULT":
        inflight = false;
        panel!.showResult(msg.result, (improved) => {
          adapter.writePrompt(input, improved);
        });
        break;

      case "ERROR":
        inflight = false;
        panel!.showError(msg.code, msg.message, () => {
          // Retry
          onTrigger(adapter);
        });
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    inflight = false;
  });

  port.postMessage({ type: "ENHANCE_REQUEST", ctx });
}

export function bootstrap(adapter: SiteAdapter): void {
  const tryInject = () => {
    const anchor = adapter.findButtonAnchor();
    if (!anchor) return;
    if (anchor.querySelector(".pe-wand")) return; // already injected

    const btn = createWandButton(() => onTrigger(adapter));
    anchor.style.position = "relative";
    anchor.appendChild(btn);
  };

  tryInject();
  const observer = new MutationObserver(() => tryInject());
  observer.observe(document.body, { childList: true, subtree: true });

  // Hotkey forwarded from service worker as a simple runtime message
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "HOTKEY_ENHANCE") onTrigger(adapter);
  });
}

function createWandButton(onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "pe-wand";
  btn.type = "button";
  btn.title = "Enhance prompt (Ctrl+Shift+E)";
  btn.setAttribute("aria-label", "Enhance prompt with PromptMate");
  btn.innerHTML = wandSvg();
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function wandSvg(): string {
  // Safe static SVG — no user data, no innerHTML risk
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/>
    <path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/>
    <path d="M17.8 6.2 19 5"/><path d="m13 13 9 9"/>
    <path d="M13.2 6.2 12 5"/>
  </svg>`;
}
