export const triageToolName = "report_triage";

export const triageInputSchema = {
  type: "object" as const,
  required: ["category", "reason", "missing"],
  properties: {
    category: {
      type: "string",
      enum: ["leave_alone", "light", "rewrite", "ask"],
    },
    reason: { type: "string" },
    missing: { type: "array", items: { type: "string" } },
    improvedPrompt: { type: "string" },
    assumptions: { type: "array", items: { type: "string" } },
    questions: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "text", "kind"],
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          kind: { type: "string", enum: ["choice", "freeform"] },
          options: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

// Equivalent JSON schema for OpenAI's response_format strict mode
export const triageJsonSchema = {
  name: "triage_result",
  strict: false,
  schema: triageInputSchema,
};
