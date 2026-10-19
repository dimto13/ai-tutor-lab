import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../../../amplify/data/resource";
import type { FeedbackRecord } from "../lib/feedbackStore";
import { encodeAwsJson } from "./awsJson.ts";

export type BetaFeedbackSubmissionResult =
  { ok: true; duplicate: boolean } | { ok: false; error: string };

type BetaFeedbackClient = ReturnType<typeof generateClient<Schema>>;
type SubmitArgs = Parameters<BetaFeedbackClient["mutations"]["submitBetaFeedback"]>[0];

let defaultClient: BetaFeedbackClient | null = null;

/**
 * Sends an already-normalized feedback record through the server-authoritative
 * Amplify mutation. Tenant and user identity are intentionally absent from the
 * input contract: the backend derives both from the authenticated caller.
 *
 * `input` is an AWSJSON argument and therefore travels as a JSON string. Sending the
 * object unchanged made every beta report fail in the cloud while the acceptance test,
 * which posts its own JSON string, stayed green (#579; same wire-format gap as #528/#569).
 */
export async function submitBetaFeedbackWithClient(
  client: BetaFeedbackClient,
  record: FeedbackRecord,
): Promise<BetaFeedbackSubmissionResult> {
  try {
    const { data, errors } = await client.mutations.submitBetaFeedback({
      input: encodeAwsJson({
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
      }) as SubmitArgs["input"],
    });

    if (errors?.length || !data?.accepted) {
      return {
        ok: false,
        error:
          errors?.map((entry) => entry.message).join("; ") || "Feedback wurde nicht bestätigt.",
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

export function submitBetaFeedback(record: FeedbackRecord): Promise<BetaFeedbackSubmissionResult> {
  defaultClient ??= generateClient<Schema>();
  return submitBetaFeedbackWithClient(defaultClient, record);
}
