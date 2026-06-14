export type Verdict = "leave_alone" | "light" | "rewrite" | "ask";

export type MissingSlot =
  | "topic"
  | "audience"
  | "output_format"
  | "constraints"
  | "tone"
  | "length"
  | "examples"
  | "context";

export interface TriageResult {
  category: Verdict;
  reason: string;
  missing: MissingSlot[];
  improvedPrompt?: string;
  assumptions?: string[];
  questions?: ClarifyingQuestion[];
}

export interface ClarifyingQuestion {
  id: string;
  text: string;
  kind: "choice" | "freeform";
  options?: string[];
}

export interface EnhanceContext {
  prompt: string;
  selection?: string;
  siteId: string;
}

export type ProviderKind = "anthropic" | "openai" | "proxy";

export interface Settings {
  provider: ProviderKind;
  model: string;
  apiKey?: string;
  proxyUrl?: string;
  hotkeyEnabled: boolean;
  autoDismissLeaveAlone: boolean;
}

export type ErrorCode =
  | "NO_KEY"
  | "RATE_LIMIT"
  | "NETWORK"
  | "PARSE_ERROR"
  | "ABORT"
  | "UNKNOWN";
