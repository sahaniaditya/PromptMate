import { placeCaretAtEnd, writeToContentEditable } from "./adapter";
import type { SiteAdapter } from "./adapter";

export const geminiAdapter: SiteAdapter = {
  id: "gemini",

  matches: (url) => url.startsWith("https://gemini.google.com/"),

  findInput() {
    return (
      document.querySelector<HTMLElement>("div.ql-editor[contenteditable='true']") ??
      document.querySelector<HTMLElement>("rich-textarea div[contenteditable='true']") ??
      document.querySelector<HTMLElement>("div[contenteditable='true']")
    );
  },

  findButtonAnchor() {
    return (
      document.querySelector<HTMLElement>("button.send-button")?.parentElement ??
      document.querySelector<HTMLElement>("button[aria-label='Send message']")?.parentElement ??
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
