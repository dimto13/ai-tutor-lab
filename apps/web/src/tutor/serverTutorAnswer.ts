import type { TutorLlmAnswer, TutorLlmAnswerKind } from "./llm/tutorGuardrails";

export interface ServerTutorOutcome {
  answer: string;
  uiTargetRefs: string[];
  /** Set only when the server tutor answered; "feedback" means the model saw a platform problem. */
  kind?: TutorLlmAnswerKind;
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
      return { answer: deterministicAnswer, uiTargetRefs: [] };
    }
    if (response.status !== "ok") return { answer: response.answer, uiTargetRefs: [] };
    return {
      answer: response.answer,
      uiTargetRefs: response.uiTargetRefs,
      ...(response.kind ? { kind: response.kind } : {}),
    };
  } catch {
    return { answer: deterministicAnswer, uiTargetRefs: [] };
  }
}
