import { placeCaretAtEnd, writeToContentEditable } from "./adapter";
import type { SiteAdapter } from "./adapter";

export const genericAdapter: SiteAdapter = {
  id: "generic",

  matches: () => true,

  findInput() {
    return (
      document.querySelector<HTMLElement>("textarea[name='q']") ??
      document.querySelector<HTMLElement>("textarea") ??
      document.querySelector<HTMLElement>("div[contenteditable='true']")
    );
  },

  findButtonAnchor() {
    return (
      document.querySelector<HTMLElement>("button[type='submit']")?.parentElement ??
      document.querySelector<HTMLElement>("form")
    );
  },

  readPrompt(el) {
    if (el instanceof HTMLTextAreaElement) return el.value;
    return el.innerText ?? el.textContent ?? "";
  },

  writePrompt(el, text) {
    if (el instanceof HTMLTextAreaElement) {
      el.value = text;
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      placeCaretAtEnd(el);
    } else {
      writeToContentEditable(el, text);
    }
  },
};
