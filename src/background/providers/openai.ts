import type { Provider } from "./provider";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export function makeOpenAIProvider(apiKey: string, model: string): Provider {
  return {
    async stream(
      system: string,
      user: string,
      onDelta: (text: string) => void,
      signal: AbortSignal,
    ): Promise<string> {
      const body = {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
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

          const choices = event.choices as Array<{ delta: { content?: string } }> | undefined;
          const delta = choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            onDelta(delta);
          }
        }
      }

      return full;
    },
  };
}
