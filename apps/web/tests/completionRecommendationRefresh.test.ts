import assert from "node:assert/strict";
import test from "node:test";
import {
  createScoreEvent,
  type AppendScoreEventResult,
  type SkillProfileProjection,
} from "@ai-train-lab/training-engine";
import {
  completionRecommendationFreshnessBaseline,
  completionRecommendationRefreshKey,
  completionScoreFinishedAt,
  shouldWaitForCompletionRecommendation,
} from "../src/completion/completionOutcome.ts";
import {
  materialSkillProfileEvidenceChanged,
  requiresFreshRecommendationEvidence,
} from "../src/dashboard/recommendationProfileFreshness.ts";
import { scoredTechnologyIdForScenario } from "../src/skill-profile/skillProfilePolicy.ts";

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
  calculatedAt = 1000 + sourceRevision,
}: {
  technologyId: string;
  points: number;
  sourceRevision: number;
  calculatedAt?: number;
}): SkillProfileProjection {
  return {
    technologyId,
    level: points > 0 ? "advanced_beginner" : "novice",
    points,
    eligibleChallengeCount: 0,
    sourceRevision,
    calculatedAt,
  };
}

test("completion keeps the next action pending while server scoring is unresolved", () => {
  assert.equal(shouldWaitForCompletionRecommendation("idle", null, false), true);
  assert.equal(shouldWaitForCompletionRecommendation("pending", null, false), true);
});

test("completion defers scoring until the initial SkillProfile baseline has settled", () => {
  const finishedAt = 2000;
  assert.equal(
    completionScoreFinishedAt(finishedAt, { status: "loading", profiles: [], error: null }),
    null,
  );
  assert.equal(
    completionScoreFinishedAt(finishedAt, { status: "ready", profiles: [], error: null }),
    finishedAt,
  );
  assert.equal(
    completionScoreFinishedAt(finishedAt, { status: "error", profiles: [], error: "network" }),
    finishedAt,
  );
  assert.equal(
    completionScoreFinishedAt(finishedAt, { status: "unavailable", profiles: [], error: null }),
    finishedAt,
  );
});

test("created award accepts only a provably pre-award SkillProfile baseline", () => {
  const result = award(2000);
  const before = [
    profile({ technologyId: "ide", points: 0, sourceRevision: 1, calculatedAt: 1500 }),
  ];
  const after = [
    profile({ technologyId: "ide", points: 100, sourceRevision: 2, calculatedAt: 2500 }),
  ];

  assert.deepEqual(
    completionRecommendationFreshnessBaseline("ready", result, {
      status: "ready",
      profiles: before,
      error: null,
    }),
    before,
  );
  assert.equal(
    completionRecommendationFreshnessBaseline("ready", result, {
      status: "ready",
      profiles: after,
      error: null,
    }),
    null,
  );
  assert.equal(
    completionRecommendationFreshnessBaseline("ready", result, {
      status: "ready",
      profiles: [],
      error: null,
    }),
    null,
  );
});

test("existing award does not require a pre-award freshness baseline", () => {
  const current = [
    profile({ technologyId: "ide", points: 100, sourceRevision: 2, calculatedAt: 2500 }),
  ];
  assert.deepEqual(
    completionRecommendationFreshnessBaseline("ready", award(2000, false), {
      status: "ready",
      profiles: current,
      error: null,
    }),
    current,
  );
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
  assert.equal(
    materialSkillProfileEvidenceChanged(before, completedTechnologyUpdated, "ide"),
    true,
  );
});

test("freshness technology comes from the canonical SkillProfile scoring policy", () => {
  assert.equal(scoredTechnologyIdForScenario("vscode-basics.challenge"), "ide");
  assert.equal(scoredTechnologyIdForScenario("artifact-preview-foundation.guided"), "artifact_preview");
  assert.equal(scoredTechnologyIdForScenario("not-a-scenario"), null);
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
