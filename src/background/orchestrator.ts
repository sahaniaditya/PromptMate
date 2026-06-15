import type { ContentToWorker, WorkerToContent } from "../shared/messages";
import { loadSettings } from "../shared/storage";
import type { ErrorCode } from "../shared/types";
import { makeAnthropicProvider } from "./providers/anthropic";
import { makeOpenAIProvider } from "./providers/openai";
import type { Provider } from "./providers/provider";
import { checkRateLimit } from "./rate-limit";
import {
  buildGenerateSystemPrompt,
  buildGenerateUserMessage,
  buildSystemPrompt,
  buildUserMessage,
} from "./triage/prompt";

function classifyError(err: unknown): ErrorCode {
  if (err instanceof DOMException && err.name === "AbortError") return "ABORT";
  const msg = String(err).toLowerCase();
  if (msg.includes("network") || msg.includes("failed to fetch")) return "NETWORK";
  if (msg.includes("parse") || msg.includes("json")) return "PARSE_ERROR";
  return "UNKNOWN";
}

function makeProvider(settings: Awaited<ReturnType<typeof loadSettings>>): Provider {
  const key = settings.apiKey ?? "";
  if (settings.provider === "openai") {
    return makeOpenAIProvider(key, settings.model);
  }
  // Default: anthropic
  return makeAnthropicProvider(key, settings.model);
}

export async function handlePortMessage(
  message: ContentToWorker,
  port: chrome.runtime.Port,
): Promise<void> {
  // Build the system + user messages for whichever request this is.
  let system: string;
  let user: string;
  if (message.type === "ENHANCE_REQUEST") {
    system = buildSystemPrompt(message.ctx.mode);
    user = buildUserMessage(message.ctx.prompt, message.ctx.selection);
  } else if (message.type === "GENERATE_REQUEST") {
    system = buildGenerateSystemPrompt(message.params);
    user = buildGenerateUserMessage(message.params);
  } else {
    return;
  }

  const settings = await loadSettings();

  if (!settings.apiKey?.trim()) {
    const msg: WorkerToContent = {
      type: "ERROR",
      code: "NO_KEY",
      message: "No API key set. Open PromptMate settings to add one.",
    };
    port.postMessage(msg);
    return;
  }

  if (!checkRateLimit()) {
    const msg: WorkerToContent = {
      type: "ERROR",
      code: "RATE_LIMIT",
      message: "Too many requests. Wait a moment and try again.",
    };
    port.postMessage(msg);
    return;
  }

  const provider = makeProvider(settings);
  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());

  const startMsg: WorkerToContent = { type: "STREAM_START" };
  port.postMessage(startMsg);

  try {
    const text = await provider.stream(
      system,
      user,
      (delta) => {
        const msg: WorkerToContent = { type: "STREAM_DELTA", text: delta };
        port.postMessage(msg);
      },
      controller.signal,
    );
    const doneMsg: WorkerToContent = { type: "DONE", text };
    port.postMessage(doneMsg);
  } catch (err) {
    if (classifyError(err) === "ABORT") return; // port disconnected — don't try to post
    const errMsg: WorkerToContent = {
      type: "ERROR",
      code: classifyError(err),
      message: String(err),
    };
    port.postMessage(errMsg);
  }
}
