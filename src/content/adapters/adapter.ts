export interface SiteAdapter {
  id: string;
  matches(url: string): boolean;

  /** Find the editable prompt element. Tries multiple selectors. */
  findInput(): HTMLElement | null;

  /** Element to anchor the wand button near (usually the send button area). */
  findButtonAnchor(): HTMLElement | null;

  /** Read the current prompt text from a textarea or contenteditable. */
  readPrompt(input: HTMLElement): string;

  /** Replace the prompt text and restore caret to end. */
  writePrompt(input: HTMLElement, text: string): void;
}

export function placeCaretAtEnd(el: HTMLElement): void {
  el.focus();
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    el.selectionStart = el.selectionEnd = el.value.length;
    return;
  }
  // contenteditable
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

export function writeToContentEditable(el: HTMLElement, text: string): void {
  // Clear then set text via a single text node so React/Vue state syncs.
  el.focus();
  document.execCommand("selectAll");
  document.execCommand("insertText", false, text);
  // Fallback if execCommand is unsupported:
  if (el.textContent !== text) {
    el.textContent = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }
  placeCaretAtEnd(el);
}
