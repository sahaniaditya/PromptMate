import { placeCaretAtEnd, writeToContentEditable } from "./adapter";
import type { SiteAdapter } from "./adapter";

export const claudeAdapter: SiteAdapter = {
  id: "claude",

  matches: (url) => url.startsWith("https://claude.ai/"),

  findInput() {
    return (
      document.querySelector<HTMLElement>("div[contenteditable='true'].ProseMirror") ??
      document.querySelector<HTMLElement>("div[contenteditable='true'][aria-label]") ??
      document.querySelector<HTMLElement>("div[contenteditable='true']")
    );
  },

  findButtonAnchor() {
    return (
      document.querySelector<HTMLElement>("button[aria-label='Send Message']")?.parentElement ??
      document.querySelector<HTMLElement>("button[type='submit']")?.parentElement ??
      null
    );
  },

  readPrompt(el) {
    return el.innerText ?? el.textContent ?? "";
  },

  writePrompt(el, text) {
    writeToContentEditable(el, text);
    placeCaretAtEnd(el);
  },
};
