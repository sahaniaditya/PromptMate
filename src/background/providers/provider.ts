import type { EnhanceContext, TriageResult } from "../../shared/types";

export interface Provider {
  /**
   * Runs the triage call. Calls onDelta with partial improvedPrompt text as it
   * streams. Returns the fully-parsed TriageResult when the call completes.
   */
  triage(
    ctx: EnhanceContext,
    onDelta: (text: string) => void,
    signal: AbortSignal,
  ): Promise<TriageResult>;
}
