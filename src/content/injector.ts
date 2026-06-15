import type { SiteAdapter } from "./adapters/adapter";
import type { WorkerToContent } from "../shared/messages";
import { ENHANCE_PORT } from "../shared/messages";
import type { EnhanceContext, EnhanceMode, PromptType } from "../shared/types";
import { loadSettings, saveSettings } from "../shared/storage";
import { openModeMenu, showErrorToast, showUndoToast } from "./panel/panel";

let inflight = false;
let defaultMode: EnhanceMode = "refine";
let defaultType: PromptType = "general";

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
    promptType: defaultType,
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

  loadSettings().then((s) => {
    defaultMode = s.defaultMode;
    defaultType = s.defaultType;
    customPos = s.wandPosition ?? null;
  });

  // Keep the type in sync if it's changed in the options popup mid-session.
  chrome.storage.onChanged.addListener((changes) => {
    const next = changes.settings?.newValue as { defaultType?: PromptType; defaultMode?: EnhanceMode } | undefined;
    if (next?.defaultType) defaultType = next.defaultType;
    if (next?.defaultMode) defaultMode = next.defaultMode;
  });

  // Universal floating overlay: the wand lives in <body> as a fixed-position
  // element. By default it hugs the input box's right edge; once dragged, it
  // stays at the user's chosen spot. Site-agnostic — needs only the input's
  // on-screen location, not the host's toolbar layout.
  controlEl = createWandControl();
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

  // ── Click + drag (unified pointer handling) ───────────────────────────────
  // We capture the pointer on pointerdown so a drag tracks reliably even when
  // the cursor leaves the small pill. Because capture retargets the native
  // click, we don't use click listeners at all — a press that doesn't move is
  // treated as a click and routed to the pressed zone here.
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;
  let moved = false;
  let pressing = false;
  let pressedCaret = false;

  controlEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !controlEl) return;
    e.preventDefault();
    pressedCaret = !!(e.target as Element).closest(".pe-wand__caret");
    const rect = controlEl.getBoundingClientRect();
    origLeft = rect.left;
    origTop = rect.top;
    startX = e.clientX;
    startY = e.clientY;
    pressing = true;
    moved = false;
    try {
      controlEl.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });

  controlEl.addEventListener("pointermove", (e) => {
    if (!pressing || !controlEl) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return; // still a click
    if (!moved) {
      moved = true;
      dragging = true; // pause the auto-positioner
      controlEl.classList.add("pe-wand--dragging");
      if (closeMenu) {
        closeMenu();
        closeMenu = null;
      }
    }
    const w = controlEl.offsetWidth;
    const h = controlEl.offsetHeight;
    const nx = clamp(origLeft + dx, EDGE_MARGIN, window.innerWidth - w - EDGE_MARGIN);
    const ny = clamp(origTop + dy, EDGE_MARGIN, window.innerHeight - h - EDGE_MARGIN);
    controlEl.style.left = `${nx}px`;
    controlEl.style.top = `${ny}px`;
    lastLeft = nx;
    lastTop = ny;
  });

  const endPress = (e: PointerEvent) => {
    if (!pressing || !controlEl) return;
    pressing = false;
    try {
      controlEl.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }

    if (moved) {
      // It was a drag → persist the new spot.
      dragging = false;
      controlEl.classList.remove("pe-wand--dragging");
      customPos = { x: lastLeft, y: lastTop };
      saveSettings({ wandPosition: customPos });
      return;
    }

    // It was a click → route to the pressed zone.
    if (pressedCaret) toggleMenu(adapter);
    else onTrigger(adapter, defaultMode);
  };
  controlEl.addEventListener("pointerup", endPress);
  controlEl.addEventListener("pointercancel", endPress);

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
 * the default mode) and a caret zone (opens the mode menu). Click and drag are
 * handled by pointer events in bootstrap — not native click listeners — so that
 * dragging can capture the pointer reliably from the first move.
 */
function createWandControl(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "pe-wand";

  const main = document.createElement("div");
  main.className = "pe-wand__main";
  main.title = "Enhance prompt (Ctrl+Shift+E)";
  main.setAttribute("role", "button");
  main.setAttribute("aria-label", "Enhance prompt with PromptMate");
  main.appendChild(buildSparkleSvg());
  main.appendChild(buildSpinner());

  const caret = document.createElement("div");
  caret.className = "pe-wand__caret";
  caret.title = "Choose enhance mode";
  caret.setAttribute("role", "button");
  caret.setAttribute("aria-label", "Choose enhance mode");
  caret.appendChild(buildCaretSvg());

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
