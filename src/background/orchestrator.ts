import type { ContentToWorker, WorkerToContent } from "../shared/messages";
import { loadSettings } from "../shared/storage";
import type { ErrorCode } from "../shared/types";
import { makeAnthropicProvider } from "./providers/anthropic";
import { makeOpenAIProvider } from "./providers/openai";
import type { Provider } from "./providers/provider";
import { checkRateLimit } from "./rate-limit";

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

export async function runEnhance(
  message: ContentToWorker,
  port: chrome.runtime.Port,
): Promise<void> {
  if (message.type !== "ENHANCE_REQUEST" && message.type !== "ANSWER_QUESTIONS") return;

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

  // For ANSWER_QUESTIONS: build an augmented context that includes the answers
  let ctx = message.ctx;
  if (message.type === "ANSWER_QUESTIONS") {
    const answerLines = Object.entries(message.answers)
      .map(([id, answer]) => `[${id}]: ${answer}`)
      .join("\n");
    ctx = {
      ...ctx,
      prompt: `${ctx.prompt}\n\n[Answers to clarifying questions]\n${answerLines}`,
    };
  }

  try {
    const result = await provider.triage(
      ctx,
      (text) => {
        const delta: WorkerToContent = { type: "STREAM_DELTA", field: "improvedPrompt", text };
        port.postMessage(delta);
      },
      controller.signal,
    );
    const resultMsg: WorkerToContent = { type: "RESULT", result };
    port.postMessage(resultMsg);
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
