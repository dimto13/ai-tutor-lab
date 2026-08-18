import assert from "node:assert/strict";
import test from "node:test";
import {
  createScoreEvent,
  type AppendScoreEventResult,
  type SkillProfileProjection,
} from "@ai-train-lab/training-engine";
import { completionCompetencyPresentation } from "../src/completion/completionOutcome.ts";

function award(): AppendScoreEventResult {
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
      occurredAt: 200,
      sourceRevision: 2,
    }),
  };
}

function profile(sourceRevision: number, calculatedAt: number): SkillProfileProjection {
  return {
    technologyId: "ide",
    level: "novice",
    points: 0,
    eligibleChallengeCount: 0,
    sourceRevision,
    calculatedAt,
  };
}

test("run-GSI revision without score evidence does not claim an unchanged competency result", () => {
  const presentation = completionCompetencyPresentation({
    scoreStatus: "ready",
    scoreResult: award(),
    baseline: { status: "ready", profiles: [profile(1, 100)], error: null },
    current: { status: "ready", profiles: [profile(2, 300)], error: null },
  });

  assert.equal(presentation.kind, "projection_pending");
});
