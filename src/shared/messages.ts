import type { EnhanceContext, ErrorCode } from "./types";

export type ContentToWorker = { type: "ENHANCE_REQUEST"; ctx: EnhanceContext };

export type WorkerToContent =
  | { type: "STREAM_START" }
  | { type: "STREAM_DELTA"; text: string }
  | { type: "DONE"; text: string }
  | { type: "ERROR"; code: ErrorCode; message: string };

export const ENHANCE_PORT = "enhance";
