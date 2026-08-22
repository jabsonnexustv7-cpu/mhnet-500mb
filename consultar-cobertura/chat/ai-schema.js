export const AI_RESPONSE_TYPES = Object.freeze([
  "FAQ",
  "OBJECTION",
  "GENERAL_HELP",
  "OUT_OF_SCOPE",
  "SYSTEM_QUERY",
  "HUMAN_HANDOFF"
]);

export const AI_SYSTEM_ACTIONS = Object.freeze([
  "NONE",
  "CHECK_COVERAGE",
  "SHOW_PLANS",
  "CHECK_SCHEDULE",
  "RESTART_FLOW",
  "HUMAN_HANDOFF"
]);

export const AI_RESPONSE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: AI_RESPONSE_TYPES },
    answer: { type: "string", minLength: 1, maxLength: 700 },
    resumeFlow: { type: "boolean" },
    resumeStep: { type: "string" },
    systemAction: { type: "string", enum: AI_SYSTEM_ACTIONS },
    handoffSuggested: { type: "boolean" }
  },
  required: ["type", "answer", "resumeFlow", "resumeStep", "systemAction", "handoffSuggested"]
});

export function validateAiResponse(value, expectedStep) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!AI_RESPONSE_TYPES.includes(value.type)) return null;
  if (!AI_SYSTEM_ACTIONS.includes(value.systemAction)) return null;
  if (typeof value.answer !== "string" || !value.answer.trim() || value.answer.length > 700) return null;
  if (typeof value.resumeFlow !== "boolean" || typeof value.handoffSuggested !== "boolean") return null;
  if (value.resumeStep !== expectedStep) return null;
  return {
    type: value.type,
    answer: value.answer.trim(),
    resumeFlow: value.resumeFlow,
    resumeStep: expectedStep,
    systemAction: value.systemAction,
    handoffSuggested: value.handoffSuggested
  };
}
