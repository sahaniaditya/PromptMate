import type { EnhanceContext } from "../../shared/types";

export interface Provider {
  /**
   * Streams the rewritten prompt. Calls onDelta with each text chunk as it
   * arrives, and resolves with the full rewritten prompt when complete.
   */
  enhance(
    ctx: EnhanceContext,
    onDelta: (text: string) => void,
    signal: AbortSignal,
  ): Promise<string>;
}
