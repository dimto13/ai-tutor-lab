/**
 * #575: Zero-token diagnostics for a *recorded* real tutor completion.
 * These observations never decide product routing or alter acceptance thresholds.
 * Never put raw model output or user text into public/redacted results.
 */
import {
  TUTOR_MODEL_INTENTS,
  routeTutorModelOutput,
  tutorModelOutputSchema,
  type TutorModelIntent,
} from "../apps/web/src/tutor/llm/tutorModelIntent.ts";

export type DiagnosticReason =
  | "accepted"
  | "provider_error"
  | "invalid_json"
  | "invalid_schema"
  | "duplicate_ui_refs"
  | "unknown_ui_ref"
  | "missing_action_ref"
  | "non_action_ui_refs"
  | "intent_kind_conflict"
  | "low_confidence"
  | "unclear_intent"
  | "model_requests_clarification"
  | "post_route_guardrail"
  | "unexpected_service_status"
  | "intent_mismatch";

export type RouteFailureReason =
  | "request_count_not_one"
  | "via_header_present"
  | "nonlocal_account_header"
  | "nonlocal_route_header"
  | "provider_response_missing"
  | "model_mismatch";

export interface RecordedAnswer {
  status: "ok" | "guardrail" | "budget_exhausted" | "provider_error";
  intent?: TutorModelIntent | null;
}

export interface ModelDiagnostics {
  rawIntent: TutorModelIntent | null;
  rawConfidence: "high" | "low" | null;
  rawKind: "explanation" | "ui_action" | "clarification" | "feedback" | null;
  rawJsonValid: boolean;
  rawSchemaValid: boolean;
  rawIntentPass: boolean;
  acceptedIntentPass: boolean;
  reason: DiagnosticReason;
}

const kinds = ["explanation", "ui_action", "clarification", "feedback"] as const;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Raw model classification is measured separately from the service's accepted route. */
export function diagnoseModelCompletion(input: {
  rawText: string | null;
  expectedIntent: TutorModelIntent;
  allowedUiTargetRefs: readonly string[];
  answer: RecordedAnswer | null;
}): ModelDiagnostics {
  let payload: unknown = null;
  let rawJsonValid = false;
  if (input.rawText !== null) {
    try {
      payload = JSON.parse(input.rawText) as unknown;
      rawJsonValid = true;
    } catch {
      // Keep the raw text private; the public report gets only a reason enum.
    }
  }
  const value = isRecord(payload) ? payload : null;
  const rawIntent =
    typeof value?.["intent"] === "string" &&
    TUTOR_MODEL_INTENTS.some((intent) => intent === value["intent"])
      ? (value["intent"] as TutorModelIntent)
      : null;
  const rawConfidence =
    value?.["confidence"] === "high" || value?.["confidence"] === "low"
      ? value["confidence"]
      : null;
  const rawKind =
    typeof value?.["kind"] === "string" && kinds.some((kind) => kind === value["kind"])
      ? (value["kind"] as (typeof kinds)[number])
      : null;
  const rawSchemaValid = tutorModelOutputSchema.safeParse(payload).success;
  const acceptedIntentPass =
    input.answer?.status === "ok" && input.answer.intent === input.expectedIntent;

  let reason: DiagnosticReason = "accepted";
  if (input.rawText === null) reason = "provider_error";
  else if (!rawJsonValid) reason = "invalid_json";
  else if (!rawSchemaValid) reason = "invalid_schema";
  else {
    const refs = value?.["uiTargetRefs"] as string[];
    const allowed = new Set(input.allowedUiTargetRefs);
    const routed = routeTutorModelOutput(payload, input.allowedUiTargetRefs);
    if (new Set(refs).size !== refs.length) reason = "duplicate_ui_refs";
    else if (refs.some((ref) => !allowed.has(ref))) reason = "unknown_ui_ref";
    else if (rawKind === "ui_action" && refs.length === 0) reason = "missing_action_ref";
    else if ((rawKind === "feedback" || rawKind === "clarification") && refs.length > 0)
      reason = "non_action_ui_refs";
    else if (routed.action === "clarify" && routed.reason === "invalid_model_decision")
      reason = "intent_kind_conflict";
    else if (routed.action === "clarify" && routed.reason === "low_confidence")
      reason = "low_confidence";
    else if (routed.action === "clarify" && routed.reason === "unclear_intent")
      reason = "unclear_intent";
    else if (routed.action === "clarify" && routed.reason === "model_requests_clarification")
      reason = "model_requests_clarification";
    else if (input.answer?.status === "guardrail") reason = "post_route_guardrail";
    else if (!input.answer || input.answer.status !== "ok") reason = "unexpected_service_status";
    else if (!acceptedIntentPass) reason = "intent_mismatch";
  }
  return {
    rawIntent,
    rawConfidence,
    rawKind,
    rawJsonValid,
    rawSchemaValid,
    rawIntentPass: rawIntent === input.expectedIntent,
    acceptedIntentPass,
    reason,
  };
}

/** Local attestation reasons are distinct from a verified cloud-forwarding event. */
export function diagnoseLocalRoute(input: {
  requests: number;
  via: string | null;
  account: string | null;
  route: string | null;
  rawModel: string | null;
  expectedModel: string;
  rawResponseReceived: boolean;
}): RouteFailureReason[] {
  const reasons: RouteFailureReason[] = [];
  if (input.requests !== 1) reasons.push("request_count_not_one");
  if (input.via !== null) reasons.push("via_header_present");
  if (input.account !== null && input.account !== "local") reasons.push("nonlocal_account_header");
  if (input.route !== null && !input.route.startsWith("local:"))
    reasons.push("nonlocal_route_header");
  if (!input.rawResponseReceived) reasons.push("provider_response_missing");
  if (input.rawModel !== null && input.rawModel !== input.expectedModel)
    reasons.push("model_mismatch");
  return reasons;
}
