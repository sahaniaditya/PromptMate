import type { ContentToWorker } from "../shared/messages";
import { ENHANCE_PORT } from "../shared/messages";
import { handlePortMessage } from "./orchestrator";

// The panel's "Open settings" link asks the worker to open the options page
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "OPEN_OPTIONS") chrome.runtime.openOptionsPage();
});

// Forward keyboard command as a message to the active tab's content script
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "enhance-prompt") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "HOTKEY_ENHANCE" }).catch(() => {
    // Tab may not have the content script — silently ignore
  });
});

// Handle long-lived port for streaming enhance + generate calls
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== ENHANCE_PORT) return;

  port.onMessage.addListener((message: ContentToWorker) => {
    handlePortMessage(message, port).catch(console.error);
  });
});
