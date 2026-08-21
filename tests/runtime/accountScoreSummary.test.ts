import assert from "node:assert/strict";
import test from "node:test";
import type { ScenarioScoreService, ScoreEvent } from "@ai-train-lab/training-engine";
import {
  ACCOUNT_SCORE_EVENT_WINDOW,
  loadAccountScoreSummary,
} from "../../apps/web/src/scoring/accountScoreSummary.ts";

function scoreEvent(index: number, points: number): ScoreEvent {
  return {
    schemaVersion: 1,
    id: `score-${index}`,
    deduplicationKey: `score-${index}`,
    type: "scenario.score.awarded",
    subject: { userId: "learner", tenantId: "tenant-a" },
    scenarioId: `scenario-${index}`,
    scenarioVersion: "1",
    sessionId: `session-${index}`,
    mode: "guided",
    occurredAt: index,
    points,
    breakdown: {
      scenarioPoints: points,
      basePoints: points,
      bonusPoints: 0,
      bonusDeductionPoints: 0,
      earnedBonusPoints: 0,
      modeMultiplier: 1,
      awardedPoints: points,
      failedAttempts: 0,
      highestHintLevelByStep: {},
    },
    sourceRevision: 1,
  };
}

function scoreService(events: readonly ScoreEvent[]): ScenarioScoreService {
  return {
    async awardScenario() {
      throw new Error("awardScenario is not used by this read-only test service");
    },
    async listScoreEvents(limit) {
      return events.slice(0, limit ?? events.length);
    },
  };
}

test("local mode does not invent a server-authoritative personal score", async () => {
  assert.deepEqual(await loadAccountScoreSummary(null), {
    kind: "unavailable",
    reason: "local-mode",
  });
});

test("a partial ledger window is reported as an exact personal score", async () => {
  const summary = await loadAccountScoreSummary(
    scoreService([scoreEvent(1, 1.25), scoreEvent(2, 2.5)]),
  );

  assert.deepEqual(summary, {
    kind: "exact",
    points: 3.75,
    eventCount: 2,
  });
});

test("a full ledger window is only reported as a lower bound", async () => {
  const events = Array.from({ length: ACCOUNT_SCORE_EVENT_WINDOW + 1 }, (_, index) =>
    scoreEvent(index, 1),
  );
  const summary = await loadAccountScoreSummary(scoreService(events));

  assert.deepEqual(summary, {
    kind: "lower-bound",
    points: ACCOUNT_SCORE_EVENT_WINDOW,
    eventCount: ACCOUNT_SCORE_EVENT_WINDOW,
  });
});
