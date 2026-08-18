import assert from "node:assert/strict";
import test from "node:test";
import { createScoreEvent, type AppendScoreEventResult } from "@ai-train-lab/training-engine";
import {
  completionRecommendationRefreshKey,
  shouldWaitForCompletionRecommendation,
} from "../src/completion/completionOutcome.ts";

function award(occurredAt: number): AppendScoreEventResult {
  return {
    created: true,
    event: createScoreEvent({
      subject: { userId: "learner-1", tenantId: "tenant-1" },
      scenarioId: "vscode-basics.challenge",
      scenarioVersion: "1",
      sessionId: "session-1",
      scenarioPoints: 100,
      mode: "challenge",
      stepIds: ["step-1"],
      occurredAt,
      sourceRevision: 2,
    }),
  };
}

test("completion keeps the next action pending while server scoring is unresolved", () => {
  assert.equal(shouldWaitForCompletionRecommendation("idle", null, false), true);
  assert.equal(shouldWaitForCompletionRecommendation("pending", null, false), true);
});

test("a successful score produces a new stable SkillProfile refresh key", () => {
  const result = award(1234);
  assert.equal(completionRecommendationRefreshKey("pending", null), "pending");
  assert.equal(completionRecommendationRefreshKey("ready", result), "ready:1234");
});

test("completion waits for the refreshed SkillProfile before exposing a follow-up action", () => {
  const result = award(1234);
  assert.equal(shouldWaitForCompletionRecommendation("ready", result, true), true);
  assert.equal(shouldWaitForCompletionRecommendation("ready", result, false), false);
});

test("score error and local-unavailable modes may use the settled recommendation fallback", () => {
  assert.equal(shouldWaitForCompletionRecommendation("error", null, false), false);
  assert.equal(shouldWaitForCompletionRecommendation("unavailable", null, false), false);
});
