import { submitBetaFeedback } from "./betaFeedbackClient";
import {
  saveFeedbackRecord,
  type FeedbackContextSnapshot,
  type FeedbackRecord,
  type FeedbackSource,
  type SaveFeedbackOptions,
} from "./feedbackStore";

export type BetaFeedbackPersistResult =
  | { ok: true; record: FeedbackRecord; duplicate: boolean }
  | { ok: false; record: FeedbackRecord | null; error: string };

/**
 * Retries delivery of the same local record. Reusing its stable client id keeps
 * the server-side conditional write idempotent and avoids creating a second
 * local record just because a previous network attempt failed.
 */
export async function retryBetaFeedback(
  record: FeedbackRecord,
): Promise<BetaFeedbackPersistResult> {
  const cloud = await submitBetaFeedback(record);
  if (!cloud.ok) {
    return {
      ok: false,
      record,
      error: "Feedback ist lokal gesichert, konnte aber nicht an die Beta-Inbox gesendet werden.",
    };
  }

  return { ok: true, record, duplicate: cloud.duplicate };
}

/**
 * Keeps the existing local feedback copy as a resilience/export fallback while
 * making the authenticated server inbox the authoritative beta delivery path.
 * Training state is not touched here; callers can surface the result without
 * coupling feedback delivery to progress/scoring.
 */
export async function persistBetaFeedback(
  source: FeedbackSource,
  text: string,
  context: Omit<FeedbackContextSnapshot, "timestamp">,
  options: SaveFeedbackOptions = {},
): Promise<BetaFeedbackPersistResult> {
  let record: FeedbackRecord;
  try {
    record = saveFeedbackRecord(source, text, context, options);
  } catch {
    return { ok: false, record: null, error: "Feedback konnte nicht lokal gesichert werden." };
  }

  return retryBetaFeedback(record);
}
