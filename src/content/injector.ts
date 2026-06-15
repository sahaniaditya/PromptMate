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

const ANCHOR_GAP = 8;
const EDGE_MARGIN = 4;
const DRAG_THRESHOLD = 4;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

export function bootstrap(adapter: SiteAdapter): void {
  // User-dragged position (viewport coords); null = auto-anchor to the input.
  let customPos: { x: number; y: number } | null = null;
  let suppressClick = false;

  loadSettings().then((s) => {
    defaultMode = s.defaultMode;
    customPos = s.wandPosition ?? null;
  });

  // Universal floating overlay: the wand lives in <body> as a fixed-position
  // element. By default it hugs the input box's right edge; once dragged, it
  // stays at the user's chosen spot. Site-agnostic — needs only the input's
  // on-screen location, not the host's toolbar layout.
  controlEl = createWandControl(
    () => { if (!suppressClick) onTrigger(adapter, defaultMode); },
    () => { if (!suppressClick) toggleMenu(adapter); },
  );
  controlEl.style.position = "fixed";
  controlEl.style.display = "none";
  document.body.appendChild(controlEl);

  // A continuous rAF loop keeps the wand pinned through every layout change —
  // scroll, window/textbox resize, SPA reflow, animations — with no missed
  // triggers. Cheap: a rect read + a style write only when the position changes.
  let lastTop = NaN;
  let lastLeft = NaN;
  let dragging = false;

  const hide = () => {
    if (controlEl && controlEl.style.display !== "none") {
      controlEl.style.display = "none";
      lastTop = NaN;
      lastLeft = NaN;
    }
  };

  const positionWand = () => {
    if (!controlEl || closeMenu || dragging) return; // hold still while open/dragging
    const input = adapter.findInput();
    if (!input) return hide();
    const r = input.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return hide();

    const w = controlEl.offsetWidth || 58;
    const h = controlEl.offsetHeight || 34;

    let left: number;
    let top: number;
    if (customPos) {
      // Keep the user's chosen spot, clamped so it stays on-screen.
      left = clamp(customPos.x, EDGE_MARGIN, window.innerWidth - w - EDGE_MARGIN);
      top = clamp(customPos.y, EDGE_MARGIN, window.innerHeight - h - EDGE_MARGIN);
    } else {
      // Default: just outside the input's right edge, vertically centered.
      left = r.right + ANCHOR_GAP;
      if (left + w > window.innerWidth - 8) left = r.right - w - ANCHOR_GAP; // fall inside if no room
      top = r.top + (r.height - h) / 2;
    }

    if (controlEl.style.display === "none") controlEl.style.display = "";
    if (left !== lastLeft || top !== lastTop) {
      controlEl.style.left = `${left}px`;
      controlEl.style.top = `${top}px`;
      lastLeft = left;
      lastTop = top;
    }
  };

  const tick = () => {
    positionWand();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // ── Drag to reposition ──────────────────────────────────────────────────
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;
  let moved = false;

  controlEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !controlEl) return;
    suppressClick = false;
    const rect = controlEl.getBoundingClientRect();
    origLeft = rect.left;
    origTop = rect.top;
    startX = e.clientX;
    startY = e.clientY;
    dragging = true;
    moved = false;
    controlEl.setPointerCapture(e.pointerId);
  });

  controlEl.addEventListener("pointermove", (e) => {
    if (!dragging || !controlEl) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return; // still a click
    moved = true;
    controlEl.classList.add("pe-wand--dragging");
    const w = controlEl.offsetWidth;
    const h = controlEl.offsetHeight;
    const nx = clamp(origLeft + dx, EDGE_MARGIN, window.innerWidth - w - EDGE_MARGIN);
    const ny = clamp(origTop + dy, EDGE_MARGIN, window.innerHeight - h - EDGE_MARGIN);
    controlEl.style.left = `${nx}px`;
    controlEl.style.top = `${ny}px`;
    lastLeft = nx;
    lastTop = ny;
  });

  const endDrag = (e: PointerEvent) => {
    if (!dragging || !controlEl) return;
    dragging = false;
    controlEl.classList.remove("pe-wand--dragging");
    try {
      controlEl.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    if (moved) {
      // Persist the new spot and suppress the click that follows pointerup.
      customPos = { x: lastLeft, y: lastTop };
      saveSettings({ wandPosition: customPos });
      suppressClick = true;
    }
  };
  controlEl.addEventListener("pointerup", endDrag);
  controlEl.addEventListener("pointercancel", endDrag);

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
