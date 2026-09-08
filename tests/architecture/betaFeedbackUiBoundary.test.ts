import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const capturePath = "apps/web/src/components/feedback/FeedbackCapture.tsx";
const submissionPath = "apps/web/src/lib/betaFeedbackSubmission.ts";

async function source(path: string): Promise<string> {
  return readFile(path, "utf8");
}

test("feedback capture uses authenticated beta delivery while preserving local fallback", async () => {
  const capture = await source(capturePath);
  const submission = await source(submissionPath);

  assert.match(capture, /persistBetaFeedback/);
  assert.match(capture, /retryBetaFeedback/);
  assert.doesNotMatch(capture, /saveFeedbackRecord\(/);
  assert.match(capture, /Feedback an die Beta-Inbox gesendet/);
  assert.match(capture, /Nutzer- und Mandantenzuordnung erfolgen serverseitig/);
  assert.match(submission, /saveFeedbackRecord\(/);
  assert.match(submission, /return retryBetaFeedback\(record\)/);
});

test("feedback retry reuses the same local record id instead of creating another record", async () => {
  const capture = await source(capturePath);
  const submission = await source(submissionPath);
  const retryBody = submission.match(
    /export async function retryBetaFeedback[\s\S]*?\n}\n\n\/\*\*/,
  )?.[0];

  assert.match(capture, /pendingRecord && pendingRecord\.text === normalizedText/);
  assert.match(capture, /await retryBetaFeedback\(pendingRecord\)/);
  assert.match(submission, /submitBetaFeedback\(record\)/);
  assert.ok(retryBody, "retryBetaFeedback implementation must be present");
  assert.doesNotMatch(retryBody, /saveFeedbackRecord\(/);
});

test("screenshots stay explicitly local and outside the server inbox payload", async () => {
  const capture = await source(capturePath);
  const submission = await source(submissionPath);

  assert.match(capture, /Screenshot bleibt ausschließlich lokal/);
  assert.match(capture, /nicht an die Beta-Inbox[\s\S]*übertragen/);
  assert.match(submission, /options: SaveFeedbackOptions/);
});
