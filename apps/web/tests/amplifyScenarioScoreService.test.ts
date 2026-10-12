import assert from "node:assert/strict";
import test from "node:test";
import { SCORE_EVENT_TYPE } from "@ai-train-lab/training-engine";
import { createAmplifyScenarioScoreServiceWithClient } from "../src/scoring/adapters/amplifyScenarioScoreService.ts";

type Client = Parameters<typeof createAmplifyScenarioScoreServiceWithClient>[0];

const breakdown = {
  scenarioPoints: 10,
  basePoints: 8,
  bonusPoints: 2,
  bonusDeductionPoints: 0,
  earnedBonusPoints: 2,
  modeMultiplier: 1,
  awardedPoints: 10,
  failedAttempts: 0,
  highestHintLevelByStep: { "select-html-artifact": 1 },
};

function scoreEventEnvelope(encodedBreakdown: unknown) {
  return {
    id: "score-award:v1|t:y|tenant-a|alice|artifact-preview-foundation.guided",
    eventType: SCORE_EVENT_TYPE,
    userId: "alice",
    tenantId: "tenant-a",
    scenarioId: "artifact-preview-foundation.guided",
    scenarioVersion: "1",
    sessionId: "artifact-preview-foundation.guided",
    mode: "guided",
    occurredAt: 1_700_000_000_000,
    points: 10,
    breakdown: encodedBreakdown,
    sourceRevision: 3,
  };
}

function awardingClient(encodedBreakdown: unknown): Client {
  return {
    mutations: {
      awardScenarioScore: async () => ({
        data: { created: true, event: scoreEventEnvelope(encodedBreakdown) },
        errors: undefined,
      }),
    },
    queries: {
      listMyScoreEvents: async () => ({
        data: [scoreEventEnvelope(encodedBreakdown)],
        errors: undefined,
      }),
    },
  } as unknown as Client;
}

test("decodes the AWSJSON score breakdown that AppSync returns as a string", async () => {
  const service = createAmplifyScenarioScoreServiceWithClient(
    awardingClient(JSON.stringify(breakdown)),
  );

  const awarded = await service.awardScenario({
    scenarioId: "artifact-preview-foundation.guided",
    mode: "guided",
  });
  assert.equal(awarded.created, true);
  assert.equal(awarded.event.points, 10);
  assert.deepEqual(awarded.event.breakdown, breakdown);

  const [listed] = await service.listScoreEvents();
  assert.deepEqual(listed?.breakdown, breakdown);
});

test("a malformed score breakdown stays an error instead of zero points", async () => {
  const service = createAmplifyScenarioScoreServiceWithClient(awardingClient("{broken"));

  await assert.rejects(
    service.awardScenario({ scenarioId: "artifact-preview-foundation.guided", mode: "guided" }),
    { message: "Score event breakdown is not valid AWSJSON" },
  );
});
