import { placeCaretAtEnd, writeToContentEditable } from "./adapter";
import type { SiteAdapter } from "./adapter";

export const chatgptAdapter: SiteAdapter = {
  id: "chatgpt",

  matches: (url) => url.startsWith("https://chatgpt.com/"),

  findInput() {
    return (
      document.querySelector<HTMLElement>("#prompt-textarea") ??
      document.querySelector<HTMLElement>("div[contenteditable='true'][data-id]") ??
      document.querySelector<HTMLElement>("div[contenteditable='true']")
    );
  },

  findButtonAnchor() {
    return (
      document.querySelector<HTMLElement>("button[data-testid='send-button']")?.parentElement ??
      document.querySelector<HTMLElement>("button[aria-label='Send prompt']")?.parentElement ??
      null
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
