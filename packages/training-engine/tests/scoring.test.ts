import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateScenarioScore,
  classifyScenarioRunEvidence,
  createScoreAwardId,
  createScoreEvent,
  FAST_RUN_THRESHOLD_RATIO,
  SCORE_MODE_MULTIPLIER,
} from "../src/scoring.ts";

const stepIds = ["step-1", "step-2"] as const;

test("applies the documented 70/30 split and mode multipliers", () => {
  const explore = calculateScenarioScore({ scenarioPoints: 100, mode: "explore", stepIds });
  const guided = calculateScenarioScore({ scenarioPoints: 100, mode: "guided", stepIds });
  const challenge = calculateScenarioScore({ scenarioPoints: 100, mode: "challenge", stepIds });

  assert.deepEqual(SCORE_MODE_MULTIPLIER, { explore: 0.5, guided: 1, challenge: 2 });
  assert.equal(guided.basePoints, 70);
  assert.equal(guided.bonusPoints, 30);
  assert.equal(explore.awardedPoints, 50);
  assert.equal(guided.awardedPoints, 100);
  assert.equal(challenge.awardedPoints, 200);
});

test("deducts help only from the affected step bonus", () => {
  const score = calculateScenarioScore({
    scenarioPoints: 100,
    mode: "guided",
    stepIds,
    hintUsage: [{ stepId: "step-1", level: 1 }],
  });

  assert.equal(score.basePoints, 70);
  assert.equal(score.bonusPoints, 30);
  assert.equal(score.bonusDeductionPoints, 1.5);
  assert.equal(score.earnedBonusPoints, 28.5);
  assert.equal(score.awardedPoints, 98.5);
});

test("uses only the highest help level reached per step", () => {
  const score = calculateScenarioScore({
    scenarioPoints: 100,
    mode: "challenge",
    stepIds,
    hintUsage: [
      { stepId: "step-1", level: 1 },
      { stepId: "step-1", level: 2 },
      { stepId: "step-1", level: 3 },
      { stepId: "step-1", level: 3 },
    ],
  });

  assert.deepEqual(score.highestHintLevelByStep, { "step-1": 3 });
  assert.equal(score.bonusDeductionPoints, 7.5);
  assert.equal(score.awardedPoints, 185);
});

test("Explore mode ignores hint deductions", () => {
  const score = calculateScenarioScore({
    scenarioPoints: 100,
    mode: "explore",
    stepIds,
    hintUsage: [
      { stepId: "step-1", level: 3 },
      { stepId: "step-2", level: 3 },
    ],
  });

  assert.equal(score.bonusDeductionPoints, 0);
  assert.equal(score.awardedPoints, 50);
});

test("failed attempts are auditable but never reduce points", () => {
  const withoutFailures = calculateScenarioScore({
    scenarioPoints: 100,
    mode: "guided",
    stepIds,
    failedAttempts: 0,
  });
  const withFailures = calculateScenarioScore({
    scenarioPoints: 100,
    mode: "guided",
    stepIds,
    failedAttempts: 7,
  });

  assert.equal(withFailures.failedAttempts, 7);
  assert.equal(withFailures.awardedPoints, withoutFailures.awardedPoints);
});

test("marks runs below 25 percent of estimated time as suspect_fast", () => {
  const evidence = classifyScenarioRunEvidence({
    startedAt: 1_000,
    finishedAt: 150_999,
    estimatedMinutes: 10,
    fastRunThresholdRatio: FAST_RUN_THRESHOLD_RATIO,
  });

  assert.equal(evidence.durationMs, 149_999);
  assert.equal(evidence.fastRunThresholdMs, 150_000);
  assert.equal(evidence.status, "suspect_fast");
  assert.equal(evidence.evidenceEligible, false);
});

test("accepts a run exactly at the fast-run threshold", () => {
  const evidence = classifyScenarioRunEvidence({
    startedAt: 1_000,
    finishedAt: 151_000,
    estimatedMinutes: 10,
    fastRunThresholdRatio: FAST_RUN_THRESHOLD_RATIO,
  });

  assert.equal(evidence.durationMs, 150_000);
  assert.equal(evidence.fastRunThresholdMs, 150_000);
  assert.equal(evidence.status, "eligible");
  assert.equal(evidence.evidenceEligible, true);
});

test("keeps timing-disabled scenarios explicitly unassessed", () => {
  const evidence = classifyScenarioRunEvidence({
    startedAt: 1_000,
    finishedAt: 20_000,
    estimatedMinutes: 2,
    fastRunThresholdRatio: null,
  });

  assert.equal(evidence.fastRunThresholdMs, null);
  assert.equal(evidence.status, "unassessed");
  assert.equal(evidence.evidenceEligible, false);
});

test("rejects invalid timing evidence", () => {
  assert.throws(
    () =>
      classifyScenarioRunEvidence({
        startedAt: 5_000,
        finishedAt: 4_999,
        estimatedMinutes: 10,
        fastRunThresholdRatio: FAST_RUN_THRESHOLD_RATIO,
      }),
    /finishedAt must be greater than or equal to startedAt/,
  );
  assert.throws(
    () =>
      classifyScenarioRunEvidence({
        startedAt: 0,
        finishedAt: 1,
        estimatedMinutes: 10,
        fastRunThresholdRatio: 1.1,
      }),
    /less than or equal to 1/,
  );
});

test("score award identity is stable for a learner and scenario version", () => {
  const identity = {
    subject: { userId: "user:1", tenantId: "tenant|a" },
    scenarioId: "vscode-basics.guided",
    scenarioVersion: "3",
  } as const;

  assert.equal(createScoreAwardId(identity), createScoreAwardId(identity));
  assert.notEqual(
    createScoreAwardId(identity),
    createScoreAwardId({ ...identity, scenarioVersion: "4" }),
  );
  assert.notEqual(
    createScoreAwardId(identity),
    createScoreAwardId({ ...identity, subject: { ...identity.subject, userId: "user:2" } }),
  );
  assert.notEqual(
    createScoreAwardId(identity),
    createScoreAwardId({ ...identity, subject: { ...identity.subject, tenantId: null } }),
  );
});

test("ScoreEvent uses the stable award id as its deduplication key and keeps the audit breakdown", () => {
  const event = createScoreEvent({
    subject: { userId: "user-1", tenantId: "tenant-1" },
    scenarioId: "vscode-basics.guided",
    scenarioVersion: "3",
    sessionId: "session-99",
    occurredAt: 1_786_779_200_000,
    scenarioPoints: 100,
    mode: "guided",
    stepIds,
    hintUsage: [{ stepId: "step-1", level: 2 }],
    failedAttempts: 4,
  });

  assert.equal(event.id, event.deduplicationKey);
  assert.equal(event.type, "scenario.score.awarded");
  assert.equal(event.points, 96.25);
  assert.equal(event.breakdown.basePoints, 70);
  assert.equal(event.breakdown.bonusDeductionPoints, 3.75);
  assert.equal(event.breakdown.failedAttempts, 4);
});

test("rejects hint evidence for a step outside the scored scenario", () => {
  assert.throws(
    () =>
      calculateScenarioScore({
        scenarioPoints: 100,
        mode: "guided",
        stepIds,
        hintUsage: [{ stepId: "unknown", level: 1 }],
      }),
    /unknown scoring step/,
  );
});
