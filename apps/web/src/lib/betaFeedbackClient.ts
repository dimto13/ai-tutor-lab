import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../../../amplify/data/resource";
import type { FeedbackRecord } from "./feedbackStore";

const client = generateClient<Schema>();

export type BetaFeedbackSubmissionResult =
  | { ok: true; feedbackId: string }
  | { ok: false; error: string };

/**
 * Sends an already-normalized feedback record through the server-authoritative
 * Amplify mutation. Tenant and user identity are intentionally absent from the
 * input contract: the backend derives both from the authenticated caller.
 */
export async function submitBetaFeedback(
  record: FeedbackRecord,
): Promise<BetaFeedbackSubmissionResult> {
  try {
    const { data, errors } = await client.mutations.submitBetaFeedback({
      feedbackId: record.id,
      source: record.source,
      kind: record.kind,
      message: record.text,
      scenarioId: record.context.scenarioId,
      stepId: record.context.stepId ?? undefined,
      mode: record.context.mode,
      runtimeAdapterId: record.context.runtimeAdapterId ?? undefined,
      runtimeContext: JSON.stringify(record.context.runtime),
      appVersion: record.context.appVersion,
      commit: record.context.commit,
      screenshot: record.screenshot ? JSON.stringify(record.screenshot) : undefined,
    });

    if (errors?.length || !data?.feedbackId) {
      return {
        ok: false,
        error: errors?.map((entry) => entry.message).join("; ") || "Feedback wurde nicht bestätigt.",
      };
    }

    return { ok: true, feedbackId: data.feedbackId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Feedback konnte nicht gesendet werden.",
    };
  }
}
