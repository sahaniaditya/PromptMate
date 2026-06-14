import type { ContentToWorker } from "../shared/messages";
import { ENHANCE_PORT } from "../shared/messages";
import { runEnhance } from "./orchestrator";

// Forward keyboard command as a message to the active tab's content script
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "enhance-prompt") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "HOTKEY_ENHANCE" }).catch(() => {
    // Tab may not have the content script — silently ignore
  });
});

// Handle long-lived port for streaming enhance calls
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== ENHANCE_PORT) return;

  port.onMessage.addListener((message: ContentToWorker) => {
    runEnhance(message, port).catch(console.error);
  });
});
