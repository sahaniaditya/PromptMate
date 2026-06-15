export type EnhanceMode = "concise" | "refine" | "detail";

export type PromptType =
  | "coding"
  | "marketing"
  | "research"
  | "education"
  | "professional"
  | "general"
  | "personal";

export type PromptLength = "short" | "moderate" | "long";

export type PromptTone = "formal" | "casual" | "professional" | "friendly" | "persuasive" | "technical";

export interface GenerateParams {
  description: string;
  promptType: PromptType;
  length: PromptLength;
  tone: PromptTone;
}

export interface EnhanceContext {
  prompt: string;
  selection?: string;
  siteId: string;
  mode: EnhanceMode;
}

export type ProviderKind = "anthropic" | "openai" | "proxy";

export type ThemeName = "violet" | "blue" | "emerald" | "rose" | "amber";

export interface Settings {
  provider: ProviderKind;
  model: string;
  apiKey?: string;
  proxyUrl?: string;
  hotkeyEnabled: boolean;
  defaultMode: EnhanceMode;
  /** User-dragged position (viewport coords). null = auto-anchor to the input. */
  wandPosition?: { x: number; y: number } | null;
  theme: ThemeName;
}

export type ErrorCode =
  | "NO_KEY"
  | "RATE_LIMIT"
  | "NETWORK"
  | "PARSE_ERROR"
  | "ABORT"
  | "UNKNOWN";
