import assert from "node:assert/strict";
import test from "node:test";
import {
  createScoreEvent,
  type AppendScoreEventResult,
  type SkillProfileProjection,
} from "@ai-train-lab/training-engine";
import {
  completionRecommendationRefreshKey,
  shouldWaitForCompletionRecommendation,
} from "../src/completion/completionOutcome.ts";
import {
  materialSkillProfileEvidenceChanged,
  requiresFreshRecommendationEvidence,
} from "../src/dashboard/recommendationProfileFreshness.ts";

function award(occurredAt: number, created = true): AppendScoreEventResult {
  return {
    created,
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

function profile({
  technologyId,
  points,
  sourceRevision,
}: {
  technologyId: string;
  points: number;
  sourceRevision: number;
}): SkillProfileProjection {
  return {
    technologyId,
    level: points > 0 ? "advanced_beginner" : "novice",
    points,
    eligibleChallengeCount: 0,
    sourceRevision,
    calculatedAt: 1000 + sourceRevision,
  };
}

test("completion keeps the next action pending while server scoring is unresolved", () => {
  assert.equal(shouldWaitForCompletionRecommendation("idle", null, false), true);
  assert.equal(shouldWaitForCompletionRecommendation("pending", null, false), true);
});

test("a new award and an existing award produce distinct stable SkillProfile refresh keys", () => {
  assert.equal(completionRecommendationRefreshKey("pending", null), "pending");
  assert.equal(completionRecommendationRefreshKey("ready", award(1234)), "ready:1234:created");
  assert.equal(
    completionRecommendationRefreshKey("ready", award(1234, false)),
    "ready:1234:existing",
  );
});

test("only a newly created award requires material fresh evidence before a competency recommendation", () => {
  assert.equal(requiresFreshRecommendationEvidence("ready:1234:created"), true);
  assert.equal(requiresFreshRecommendationEvidence("ready:1234:existing"), false);
  assert.equal(requiresFreshRecommendationEvidence("pending"), false);
});

test("a sourceRevision-only refresh is not accepted as fresh competency evidence", () => {
  const before = [profile({ technologyId: "ide", points: 0, sourceRevision: 1 })];
  const after = [profile({ technologyId: "ide", points: 0, sourceRevision: 2 })];
  assert.equal(materialSkillProfileEvidenceChanged(before, after, "ide"), false);
});

test("material evidence must change for the completed technology, not merely elsewhere", () => {
  const before = [
    profile({ technologyId: "ide", points: 0, sourceRevision: 1 }),
    profile({ technologyId: "source_control", points: 0, sourceRevision: 1 }),
  ];
  const unrelatedOnly = [
    profile({ technologyId: "ide", points: 0, sourceRevision: 2 }),
    profile({ technologyId: "source_control", points: 50, sourceRevision: 2 }),
  ];
  const completedTechnologyUpdated = [
    profile({ technologyId: "ide", points: 100, sourceRevision: 2 }),
    profile({ technologyId: "source_control", points: 50, sourceRevision: 2 }),
  ];

  assert.equal(materialSkillProfileEvidenceChanged(before, unrelatedOnly, "ide"), false);
  assert.equal(materialSkillProfileEvidenceChanged(before, completedTechnologyUpdated, "ide"), true);
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
