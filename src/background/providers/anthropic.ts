import type { EnhanceContext, TriageResult } from "../../shared/types";
import { TRIAGE_SYSTEM_PROMPT, buildUserMessage } from "../triage/prompt";
import { triageInputSchema, triageToolName } from "../triage/schema";
import type { Provider } from "./provider";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Extracts the leading text of improvedPrompt from a partial input_json string.
 * Returns null if the key hasn't appeared yet.
 */
function extractPartialImprovedPrompt(partial: string): string | null {
  const marker = '"improvedPrompt":"';
  const start = partial.indexOf(marker);
  if (start === -1) return null;
  const after = partial.slice(start + marker.length);
  // Collect characters until an unescaped closing quote
  let result = "";
  let i = 0;
  while (i < after.length) {
    const ch = after[i];
    if (ch === "\\" && i + 1 < after.length) {
      const next = after[i + 1];
      if (next === '"') result += '"';
      else if (next === "n") result += "\n";
      else if (next === "t") result += "\t";
      else if (next === "\\") result += "\\";
      else result += next;
      i += 2;
      continue;
    }
    if (ch === '"') break;
    result += ch;
    i++;
  }
  return result;
}

export function makeAnthropicProvider(apiKey: string, model: string): Provider {
  return {
    async triage(
      ctx: EnhanceContext,
      onDelta: (text: string) => void,
      signal: AbortSignal,
    ): Promise<TriageResult> {
      const body = {
        model,
        max_tokens: 1024,
        system: TRIAGE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(ctx.prompt, ctx.selection) }],
        tools: [
          {
            name: triageToolName,
            description: "Report the triage verdict for the user's draft prompt.",
            input_schema: triageInputSchema,
          },
        ],
        tool_choice: { type: "tool", name: triageToolName },
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
      let accumulatedJson = "";
      let lastSentLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // SSE lines
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
            if (delta?.type === "input_json_delta") {
              accumulatedJson += delta.partial_json as string;
              const current = extractPartialImprovedPrompt(accumulatedJson);
              if (current && current.length > lastSentLength) {
                onDelta(current.slice(lastSentLength));
                lastSentLength = current.length;
              }
            }
          }
        }
      }

      // Parse final tool input
      const parsed = JSON.parse(accumulatedJson) as TriageResult;
      return parsed;
    },
  };
}
