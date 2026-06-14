import type { EnhanceContext, ErrorCode, TriageResult } from "./types";

export type ContentToWorker =
  | { type: "ENHANCE_REQUEST"; ctx: EnhanceContext }
  | { type: "ANSWER_QUESTIONS"; ctx: EnhanceContext; answers: Record<string, string> };

export type WorkerToContent =
  | { type: "STREAM_START" }
  | { type: "STREAM_DELTA"; field: "improvedPrompt"; text: string }
  | { type: "RESULT"; result: TriageResult }
  | { type: "ERROR"; code: ErrorCode; message: string };

export const ENHANCE_PORT = "enhance";
