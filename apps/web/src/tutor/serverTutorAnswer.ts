import type { TutorLlmAnswer, TutorLlmAnswerKind } from "./llm/tutorGuardrails";
import type { TutorModelIntent } from "./llm/tutorModelIntent";
import type { TutorReply, TutorFeedbackOffer } from "./deterministicTutor";

export interface ServerTutorOutcome {
  answer: string;
  uiTargetRefs: string[];
  /** Set only when the server tutor answered; "feedback" means the model saw a platform problem. */
  kind?: TutorLlmAnswerKind;
  intent?: TutorModelIntent;
  feedbackKind?: "problem" | "improvement" | "general";
  /** Set when the deterministic answer stayed, so its own follow-up offer still applies. */
  fallback?: true;
}

/**
 * Prefers the server tutor's answer. Whatever fails on the way (relay, managed node, NAS, rotator,
 * model or the SSR time limit), the deterministic answer (#28) stays (#481).
 */
export async function preferServerTutor(
  deterministicAnswer: string,
  ask: () => Promise<TutorLlmAnswer | { status: "unavailable" }>,
): Promise<ServerTutorOutcome> {
  try {
    const response = await ask();
    if (response.status === "unavailable" || !response.answer.trim()) {
      return { answer: deterministicAnswer, uiTargetRefs: [], fallback: true };
    }
    if (response.status !== "ok") return { answer: response.answer, uiTargetRefs: [] };
    return {
      answer: response.answer,
      uiTargetRefs: response.uiTargetRefs,
      ...(response.kind ? { kind: response.kind } : {}),
      ...(response.intent ? { intent: response.intent } : {}),
      ...(response.feedbackKind ? { feedbackKind: response.feedbackKind } : {}),
    };
  } catch {
    return { answer: deterministicAnswer, uiTargetRefs: [], fallback: true };
  }
}

/** An actual model request is always attempted BEFORE the lexical offline fallback. */
export interface ModelFirstTutorOutcome extends ServerTutorOutcome {
  feedbackKind?: "problem" | "improvement" | "general";
  fallbackOffer?: TutorFeedbackOffer;
}

export async function resolveModelFirstTutor(
  ask: (() => Promise<TutorLlmAnswer | { status: "unavailable" }>) | null,
  offlineFallback: () => TutorReply,
): Promise<ModelFirstTutorOutcome> {
  const resolveOfflineFallback = (): ModelFirstTutorOutcome => {
    const reply = offlineFallback();
    return {
      answer: `Eingeschränkter Tutor-Modus ohne Sprachmodell: ${reply.text}`,
      uiTargetRefs: [],
      fallback: true,
      ...(reply.offer || reply.fallbackOffer
        ? { fallbackOffer: reply.offer ?? reply.fallbackOffer }
        : {}),
    };
  };

  if (!ask) return resolveOfflineFallback();
  try {
    const response = await ask();
    if (response.status === "unavailable" || !response.answer.trim()) return resolveOfflineFallback();
    if (response.status !== "ok") {
      return { answer: response.answer, uiTargetRefs: [] };
    }
    return {
      answer: response.answer,
      uiTargetRefs: response.uiTargetRefs,
      ...(response.kind ? { kind: response.kind } : {}),
      ...(response.intent ? { intent: response.intent } : {}),
      ...(response.feedbackKind ? { feedbackKind: response.feedbackKind } : {}),
    };
  } catch {
    return resolveOfflineFallback();
  }
}
