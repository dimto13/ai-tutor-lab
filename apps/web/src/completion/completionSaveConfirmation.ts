export type CompletionSaveStatus = "idle" | "pending" | "confirmed" | "error";

export interface CompletionSaveConfirmation {
  readonly status: CompletionSaveStatus;
  /**
   * Completion identity owned by this state. A confirmation for one finishedAt must never unlock
   * scoring for a different completion.
   */
  readonly finishedAt: number | null;
}

export const initialCompletionSaveConfirmation: CompletionSaveConfirmation = {
  status: "idle",
  finishedAt: null,
};

export function pendingCompletionSave(finishedAt: number): CompletionSaveConfirmation {
  return { status: "pending", finishedAt };
}

export function confirmedCompletionSave(finishedAt: number): CompletionSaveConfirmation {
  return { status: "confirmed", finishedAt };
}

export function failedCompletionSave(finishedAt: number): CompletionSaveConfirmation {
  return { status: "error", finishedAt };
}

/**
 * Scoring is unlocked only by an authoritative save confirmation for this exact completion.
 *
 * A missing error is deliberately not treated as success: during the normal async save window the
 * error is null as well, which was the race that allowed awardScenarioScore to overtake saveSession.
 */
export function confirmedCompletionFinishedAt(
  progressFinishedAt: number | null,
  confirmation: CompletionSaveConfirmation,
): number | null {
  if (progressFinishedAt === null) return null;
  if (confirmation.status !== "confirmed") return null;
  return confirmation.finishedAt === progressFinishedAt ? progressFinishedAt : null;
}

/**
 * Confirmation after a session write settled. `authoritative` is the persisted session the write
 * was resolved to after a conflict, or `null` when the written session itself was stored.
 *
 * A conflict that resolved to a different session did not store this completion, so it is never
 * reported as confirmed; the completion screen follows the persisted state instead.
 */
export function completionSaveAfterWrite(
  finishedAt: number | null,
  authoritative: { readonly finishedAt: number | null } | null,
): CompletionSaveConfirmation {
  if (finishedAt === null) return initialCompletionSaveConfirmation;
  if (authoritative && authoritative.finishedAt !== finishedAt) {
    return initialCompletionSaveConfirmation;
  }
  return confirmedCompletionSave(finishedAt);
}
