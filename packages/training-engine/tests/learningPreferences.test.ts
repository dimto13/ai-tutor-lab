import assert from "node:assert/strict";
import test from "node:test";
import {
  explanationDepthForSelfAssessedAiLevel,
  isSelfAssessedAiLevel,
  recommendationForSelfAssessedAiLevel,
} from "../src/learningPreferences.ts";

test("self-assessed AI levels are stable domain values", () => {
  assert.equal(isSelfAssessedAiLevel("beginner"), true);
  assert.equal(isSelfAssessedAiLevel("intermediate"), true);
  assert.equal(isSelfAssessedAiLevel("advanced"), true);
  assert.equal(isSelfAssessedAiLevel("Anfänger"), false);
  assert.equal(isSelfAssessedAiLevel(null), false);
});

test("explanation depth changes with self-assessed AI level", () => {
  assert.equal(explanationDepthForSelfAssessedAiLevel("beginner"), "foundational");
  assert.equal(explanationDepthForSelfAssessedAiLevel("intermediate"), "balanced");
  assert.equal(explanationDepthForSelfAssessedAiLevel("advanced"), "concise");
});

test("recommendation changes with self-assessed AI level", () => {
  const beginner = recommendationForSelfAssessedAiLevel("beginner");
  const intermediate = recommendationForSelfAssessedAiLevel("intermediate");
  const advanced = recommendationForSelfAssessedAiLevel("advanced");

  assert.equal(beginner.scenarioId, "vscode-basics.guided");
  assert.equal(beginner.mode, "guided");
  assert.equal(intermediate.scenarioId, "copilot-basics.guided");
  assert.equal(intermediate.mode, "guided");
  assert.equal(advanced.scenarioId, "copilot-basics.challenge");
  assert.equal(advanced.mode, "challenge");
});
