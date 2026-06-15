import type { EnhanceMode, ErrorCode } from "../../shared/types";

export interface ModeDef {
  id: EnhanceMode;
  label: string;
  desc: string;
}

export const MODES: ModeDef[] = [
  { id: "concise", label: "Concise", desc: "Shorten while keeping intent" },
  { id: "refine", label: "Refine", desc: "Improve clarity & structure" },
  { id: "detail", label: "Detail", desc: "Expand with specifics" },
];

/**
 * Opens the mode menu as a fixed popover above the given anchor element.
 * Returns a close() function. Closes on outside-click or Escape.
 */
export function openModeMenu(
  anchor: HTMLElement,
  current: EnhanceMode,
  onPick: (mode: EnhanceMode) => void,
): () => void {
  const menu = el("div", { className: "pe-menu" });

  for (const mode of MODES) {
    const row = el("button", { className: "pe-menu-row" });
    row.type = "button";
    if (mode.id === current) row.classList.add("pe-menu-row--active");

    const label = el("span", { className: "pe-menu-label" });
    label.textContent = mode.label;
    const desc = el("span", { className: "pe-menu-desc" });
    desc.textContent = mode.desc;

    row.appendChild(label);
    row.appendChild(desc);
    row.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
      onPick(mode.id);
    });
    menu.appendChild(row);
  }

  document.body.appendChild(menu);

  // Anchor above the control, right-aligned to it.
  const r = anchor.getBoundingClientRect();
  const mr = menu.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.top = `${Math.max(8, r.top - mr.height - 8)}px`;
  menu.style.left = `${Math.max(8, r.right - mr.width)}px`;

  const onDocClick = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node) && !anchor.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  // Defer so the opening click doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener("click", onDocClick, true);
    document.removeEventListener("keydown", onKey, true);
    menu.remove();
  }

  return close;
}

/** Brief toast confirming the prompt was replaced, with an Undo action. */
export function showUndoToast(onUndo: () => void): void {
  const toast = el("div", { className: "pe-toast pe-toast--revert" });
  const msg = el("span");
  msg.textContent = "Prompt updated.";
  toast.appendChild(msg);

  const undoBtn = el("button", { className: "pe-toast-btn" });
  undoBtn.textContent = "Undo";
  undoBtn.addEventListener("click", () => {
    onUndo();
    toast.remove();
  });
  toast.appendChild(undoBtn);

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 8000);
}

/** Error toast. NO_KEY links to settings; others offer Retry. */
export function showErrorToast(code: ErrorCode, message: string, onRetry: () => void): void {
  const toast = el("div", { className: "pe-toast pe-toast--error" });
  const msg = el("span");

  if (code === "NO_KEY") {
    msg.textContent = "No API key set.";
    toast.appendChild(msg);
    const link = el("button", { className: "pe-toast-btn" });
    link.textContent = "Open settings";
    link.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
      toast.remove();
    });
    toast.appendChild(link);
  } else {
    msg.textContent = code === "RATE_LIMIT" ? message : "Couldn't enhance the prompt.";
    toast.appendChild(msg);
    const retry = el("button", { className: "pe-toast-btn" });
    retry.textContent = "Retry";
    retry.addEventListener("click", () => {
      onRetry();
      toast.remove();
    });
    toast.appendChild(retry);
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 8000);
}

// ── DOM helpers ────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: { className?: string; id?: string },
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props?.className) node.className = props.className;
  if (props?.id) node.id = props.id;
  return node;
}
