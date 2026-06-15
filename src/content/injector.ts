import type { SiteAdapter } from "./adapters/adapter";
import type { WorkerToContent } from "../shared/messages";
import { ENHANCE_PORT } from "../shared/messages";
import type { EnhanceContext, EnhanceMode } from "../shared/types";
import { loadSettings, saveSettings } from "../shared/storage";
import { openModeMenu, showErrorToast, showUndoToast } from "./panel/panel";

let inflight = false;
let defaultMode: EnhanceMode = "refine";

function getSelection(): string | undefined {
  const sel = window.getSelection()?.toString().trim();
  return sel || undefined;
}

function onTrigger(adapter: SiteAdapter, mode: EnhanceMode): void {
  if (inflight) return;

  const input = adapter.findInput();
  if (!input) return;

  const original = adapter.readPrompt(input).trim();
  if (!original) return;

  const ctx: EnhanceContext = {
    prompt: original,
    selection: getSelection(),
    siteId: adapter.id,
    mode,
  };

  inflight = true;
  setWandBusy(true);

  let streamed = "";
  const port = chrome.runtime.connect({ name: ENHANCE_PORT });

  const finish = () => {
    inflight = false;
    setWandBusy(false);
  };

  port.onMessage.addListener((msg: WorkerToContent) => {
    switch (msg.type) {
      case "STREAM_START":
        break;

      case "STREAM_DELTA":
        streamed += msg.text;
        adapter.writePrompt(input, streamed);
        break;

      case "DONE":
        finish();
        // Ensure the box holds the exact final text.
        adapter.writePrompt(input, msg.text);
        showUndoToast(() => adapter.writePrompt(input, original));
        port.disconnect();
        break;

      case "ERROR":
        finish();
        // Roll back anything streamed in.
        adapter.writePrompt(input, original);
        showErrorToast(msg.code, msg.message, () => onTrigger(adapter, mode));
        port.disconnect();
        break;
    }
  });

  port.onDisconnect.addListener(finish);

  port.postMessage({ type: "ENHANCE_REQUEST", ctx });
}

let controlEl: HTMLElement | null = null;
let closeMenu: (() => void) | null = null;

export function bootstrap(adapter: SiteAdapter): void {
  loadSettings().then((s) => {
    defaultMode = s.defaultMode;
  });

  // Insert the wand as a real flex sibling inside the host's trailing button
  // group. The browser then aligns and reflows it automatically — no positioning
  // JS, no scroll/resize observers. We only re-insert if the SPA wipes it out.
  const ensureInjected = () => {
    if (controlEl && controlEl.isConnected) return;

    const sendBtn = adapter.findButtonAnchor();
    if (!sendBtn) return;

    const group = findTrailingGroup(sendBtn);
    if (!controlEl) {
      controlEl = createWandControl(
        () => onTrigger(adapter, defaultMode),
        () => toggleMenu(adapter),
      );
    }
    // Sit first in the trailing group so the order reads: wand · mic · send.
    group.insertBefore(controlEl, group.firstChild);
  };

  ensureInjected();

  // Re-insert on SPA re-renders that replace the composer/toolbar.
  const observer = new MutationObserver(() => ensureInjected());
  observer.observe(document.body, { childList: true, subtree: true });

  // Hotkey forwarded from service worker → run the default mode.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "HOTKEY_ENHANCE") onTrigger(adapter, defaultMode);
  });
}

function toggleMenu(adapter: SiteAdapter): void {
  if (closeMenu) {
    closeMenu();
    closeMenu = null;
    return;
  }
  if (!controlEl) return;
  closeMenu = openModeMenu(controlEl, defaultMode, (mode) => {
    closeMenu = null;
    defaultMode = mode;
    saveSettings({ defaultMode: mode });
    onTrigger(adapter, mode);
  });
}

function setWandBusy(busy: boolean): void {
  if (!controlEl) return;
  controlEl.classList.toggle("pe-wand--busy", busy);
}

/**
 * Finds the trailing button group: the smallest ancestor of the send button
 * that holds 2+ interactive controls (mic + send / voice) but is still a tight
 * group, not the whole composer bar. We inject the wand into this container as a
 * flex sibling so it aligns and reflows with the host's own buttons.
 */
function findTrailingGroup(sendBtn: HTMLElement): HTMLElement {
  const scope = sendBtn.closest("form") ?? document.body;
  const formW = scope.getBoundingClientRect().width || window.innerWidth;

  let node: HTMLElement | null = sendBtn.parentElement;
  let best: HTMLElement = sendBtn.parentElement ?? sendBtn;
  for (let i = 0; i < 5 && node && node !== scope; i++) {
    const count = node.querySelectorAll("button, [role='button']").length;
    const w = node.getBoundingClientRect().width;
    // A genuine trailing cluster: multiple controls, but not the full-width bar.
    if (count >= 2 && w <= formW * 0.6) best = node;
    node = node.parentElement;
  }
  return best;
}

/**
 * Builds the split-button control: one rounded pill with a sparkle zone (runs
 * the default mode) and a caret zone (opens the mode menu).
 */
function createWandControl(onRun: () => void, onToggleMenu: () => void): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "pe-wand";

  const main = document.createElement("button");
  main.className = "pe-wand__main";
  main.type = "button";
  main.title = "Enhance prompt (Ctrl+Shift+E)";
  main.setAttribute("aria-label", "Enhance prompt with PromptMate");
  main.appendChild(buildSparkleSvg());
  main.appendChild(buildSpinner());
  main.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onRun();
  });

  const caret = document.createElement("button");
  caret.className = "pe-wand__caret";
  caret.type = "button";
  caret.title = "Choose enhance mode";
  caret.setAttribute("aria-label", "Choose enhance mode");
  caret.appendChild(buildCaretSvg());
  caret.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleMenu();
  });

  wrap.appendChild(main);
  wrap.appendChild(caret);
  return wrap;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function makeSvg(width: number, attrs: Record<string, string>, paths: string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(width));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

/**
 * Sparkle icon, built via DOM APIs (no innerHTML) so it works on sites enforcing
 * Trusted Types CSP (Gemini/Google, ChatGPT).
 */
function buildSparkleSvg(): SVGSVGElement {
  const svg = makeSvg(20, { fill: "currentColor" }, [
    "M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z",
    "M18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z",
    "M5 4l.6 1.6L7 6l-1.4.4L5 8l-.6-1.6L3 6l1.4-.4L5 4z",
  ]);
  svg.classList.add("pe-wand__icon");
  return svg;
}

function buildCaretSvg(): SVGSVGElement {
  const svg = makeSvg(14, {
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2.5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  }, ["M6 9l6 6 6-6"]);
  return svg;
}

function buildSpinner(): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "pe-wand__spinner";
  return span;
}
