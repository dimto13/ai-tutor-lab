import { z } from "zod";

/**
 * A decision made by the language model from the utterance + previous turns + scenario context.
 * The application can validate its declared intent, but never infers intent from keywords here.
 *
 * This contract is prepared for the model-first integration of #147. Until TutorChat and the
 * structured provider response are wired, do not treat it as active production classification.
 */
export const TUTOR_MODEL_INTENTS = [
  "learning_help",
  "platform_question",
  "tool_question",
  "general_question",
  "problem_report",
  "feature_request",
  "feedback",
  "smalltalk",
  "unclear",
] as const;

export const tutorModelIntentSchema = z
  .object({
    intent: z.enum(TUTOR_MODEL_INTENTS),
    confidence: z.enum(["high", "low"]),
  })
  .strict();

export type TutorModelIntent = (typeof TUTOR_MODEL_INTENTS)[number];
export type TutorModelIntentDecision = z.infer<typeof tutorModelIntentSchema>;

export type TutorModelRoute =
  | {
      action: "answer";
      intent:
        "learning_help" | "platform_question" | "tool_question" | "general_question" | "smalltalk";
    }
  | {
      action: "offer_feedback";
      intent: "problem_report" | "feature_request" | "feedback";
      feedbackKind: "problem" | "improvement" | "general";
    }
  | {
      action: "clarify";
      reason: "invalid_model_decision" | "low_confidence" | "unclear_intent";
    };

/**
 * Called ONLY after an authenticated, structurally valid model response.
 * Neither this function nor the model may send feedback, change scores, or perform UI actions.
 * Feedback becomes a user-confirmable offer; ambiguity is never silently reclassified.
 */
export function routeTutorModelIntent(rawDecision: unknown): TutorModelRoute {
  const parsed = tutorModelIntentSchema.safeParse(rawDecision);
  if (!parsed.success) return { action: "clarify", reason: "invalid_model_decision" };

  const { intent, confidence } = parsed.data;
  if (confidence === "low") return { action: "clarify", reason: "low_confidence" };
  if (intent === "unclear") return { action: "clarify", reason: "unclear_intent" };

  switch (intent) {
    case "problem_report":
      return { action: "offer_feedback", intent, feedbackKind: "problem" };
    case "feature_request":
      return { action: "offer_feedback", intent, feedbackKind: "improvement" };
    case "feedback":
      return { action: "offer_feedback", intent, feedbackKind: "general" };
    case "learning_help":
    case "platform_question":
    case "tool_question":
    case "general_question":
    case "smalltalk":
      return { action: "answer", intent };
  }
}

/**
 * The model must return the intent and response together in ONE request. The model only
 * suggests a UI action; this validator has no persistence, scoring or write capability.
 */
export const tutorModelOutputSchema = tutorModelIntentSchema
  .extend({
    answer: z.string().trim().min(1).max(4_000),
    kind: z.enum(["explanation", "ui_action", "clarification", "feedback"]),
    uiTargetRefs: z.array(z.string().min(1).max(200)).max(8),
  })
  .strict();

export type TutorModelOutputRoute =
  | {
      action: "answer";
      intent: Extract<TutorModelRoute, { action: "answer" }>["intent"];
      answer: string;
      kind: "explanation" | "ui_action";
      uiTargetRefs: string[];
    }
  | {
      action: "offer_feedback";
      intent: Extract<TutorModelRoute, { action: "offer_feedback" }>["intent"];
      feedbackKind: "problem" | "improvement" | "general";
      answer: string;
    }
  | {
      action: "clarify";
      reason:
        | "invalid_model_decision"
        | "low_confidence"
        | "unclear_intent"
        | "model_requests_clarification";
      answer: string;
    };

const SAFE_CLARIFICATION =
  "Möchtest du eine Antwort auf deine Frage oder soll ich deine Nachricht als Rückmeldung an das Team vorbereiten?";

/** Parse provider output strictly: no unknown keys, forged references or automatic reports. */
export function routeTutorModelOutput(
  rawOutput: unknown,
  allowedUiTargetRefs: readonly string[],
): TutorModelOutputRoute {
  let value = rawOutput;
  if (typeof rawOutput === "string") {
    try {
      value = JSON.parse(rawOutput);
    } catch {
      return {
        action: "clarify",
        reason: "invalid_model_decision",
        answer: SAFE_CLARIFICATION,
      };
    }
  }
  const parsed = tutorModelOutputSchema.safeParse(value);
  if (!parsed.success) {
    return { action: "clarify", reason: "invalid_model_decision", answer: SAFE_CLARIFICATION };
  }
  const result = parsed.data;
  const allowed = new Set(allowedUiTargetRefs);
  if (
    new Set(result.uiTargetRefs).size !== result.uiTargetRefs.length ||
    result.uiTargetRefs.some((ref) => !allowed.has(ref)) ||
    (result.kind === "ui_action" && result.uiTargetRefs.length === 0) ||
    ((result.kind === "feedback" || result.kind === "clarification") &&
      result.uiTargetRefs.length > 0)
  ) {
    return { action: "clarify", reason: "invalid_model_decision", answer: SAFE_CLARIFICATION };
  }
  // Intent schema is strict: pass the decision fields only, not the enclosing answer object.
  const intentRoute = routeTutorModelIntent({
    intent: result.intent,
    confidence: result.confidence,
  });
  if (intentRoute.action === "clarify") {
    return {
      ...intentRoute,
      answer: result.kind === "clarification" ? result.answer : SAFE_CLARIFICATION,
    };
  }
  if (result.kind === "clarification") {
    return {
      action: "clarify",
      reason: "model_requests_clarification",
      answer: result.answer,
    };
  }
  if (intentRoute.action === "offer_feedback") {
    if (result.kind !== "feedback") {
      return { action: "clarify", reason: "invalid_model_decision", answer: SAFE_CLARIFICATION };
    }
    return { ...intentRoute, answer: result.answer };
  }
  if (result.kind === "feedback") {
    return { action: "clarify", reason: "invalid_model_decision", answer: SAFE_CLARIFICATION };
  }
  return {
    ...intentRoute,
    answer: result.answer,
    kind: result.kind,
    uiTargetRefs: result.uiTargetRefs,
  };
}
