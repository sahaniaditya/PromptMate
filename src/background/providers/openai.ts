import type { EnhanceContext, TriageResult } from "../../shared/types";
import { TRIAGE_SYSTEM_PROMPT, buildUserMessage } from "../triage/prompt";
import { triageJsonSchema } from "../triage/schema";
import type { Provider } from "./provider";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

function extractPartialImprovedPrompt(partial: string): string | null {
  const marker = '"improvedPrompt":"';
  const start = partial.indexOf(marker);
  if (start === -1) return null;
  const after = partial.slice(start + marker.length);
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

export function makeOpenAIProvider(apiKey: string, model: string): Provider {
  return {
    async triage(
      ctx: EnhanceContext,
      onDelta: (text: string) => void,
      signal: AbortSignal,
    ): Promise<TriageResult> {
      const body = {
        model,
        messages: [
          { role: "system", content: TRIAGE_SYSTEM_PROMPT },
          { role: "user", content: buildUserMessage(ctx.prompt, ctx.selection) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: triageJsonSchema,
        },
        stream: true,
        max_tokens: 1024,
      };

      const resp = await fetch(OPENAI_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`OpenAI ${resp.status}: ${text}`);
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";
      let lastSentLength = 0;

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

          const choices = event.choices as Array<{ delta: { content?: string } }> | undefined;
          const delta = choices?.[0]?.delta?.content;
          if (delta) {
            accumulatedContent += delta;
            const current = extractPartialImprovedPrompt(accumulatedContent);
            if (current && current.length > lastSentLength) {
              onDelta(current.slice(lastSentLength));
              lastSentLength = current.length;
            }
          }
        }
      }

      const parsed = JSON.parse(accumulatedContent) as TriageResult;
      return parsed;
    },
  };
}
