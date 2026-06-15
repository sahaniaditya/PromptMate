import type { EnhanceContext } from "../../shared/types";
import { buildSystemPrompt, buildUserMessage } from "../triage/prompt";
import type { Provider } from "./provider";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export function makeAnthropicProvider(apiKey: string, model: string): Provider {
  return {
    async enhance(
      ctx: EnhanceContext,
      onDelta: (text: string) => void,
      signal: AbortSignal,
    ): Promise<string> {
      const body = {
        model,
        max_tokens: 1024,
        system: buildSystemPrompt(ctx.mode),
        messages: [{ role: "user", content: buildUserMessage(ctx.prompt, ctx.selection) }],
        stream: true,
      };

      const resp = await fetch(ANTHROPIC_ENDPOINT, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "anthropic-dangerous-direct-browser-access": "true",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Anthropic ${resp.status}: ${text}`);
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(raw);
          } catch {
            continue;
          }

          if (event.type === "content_block_delta") {
            const delta = event.delta as Record<string, unknown> | undefined;
            if (delta?.type === "text_delta" && typeof delta.text === "string") {
              full += delta.text;
              onDelta(delta.text);
            }
          }
        }
      }

      return full;
    },
  };
}
