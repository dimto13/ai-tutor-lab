import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../../../amplify/data/resource";
import type { FeedbackRecord } from "./feedbackStore";

const client = generateClient<Schema>();

export type BetaFeedbackSubmissionResult =
  | { ok: true; duplicate: boolean }
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
      input: {
        id: record.id,
        source: record.source,
        kind: record.kind,
        text: record.text,
        context: {
          scenarioId: record.context.scenarioId,
          stepId: record.context.stepId,
          mode: record.context.mode,
          runtimeAdapterId: record.context.runtimeAdapterId,
          appVersion: record.context.appVersion,
          commit: record.context.commit,
          timestamp: record.context.timestamp,
        },
      },
    });

    if (errors?.length || !data?.accepted) {
      return {
        ok: false,
        error: errors?.map((entry) => entry.message).join("; ") || "Feedback wurde nicht bestätigt.",
      };
    }

    return { ok: true, duplicate: data.duplicate };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Feedback konnte nicht gesendet werden.",
    };
  }
}
