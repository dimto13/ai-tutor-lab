import type { TutorLlmAnswer } from "./llm/tutorGuardrails";

export interface ServerTutorOutcome {
  answer: string;
  uiTargetRefs: string[];
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
    if (response.status === "unavailable") return { answer: deterministicAnswer, uiTargetRefs: [] };
    return {
      answer: response.answer,
      uiTargetRefs: response.status === "ok" ? response.uiTargetRefs : [],
    };
  } catch {
    return { answer: deterministicAnswer, uiTargetRefs: [] };
  }
}
