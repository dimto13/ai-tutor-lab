import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptationForSelfAssessedAiLevel,
  explanationDepthForSelfAssessedAiLevel,
  isSelfAssessedAiLevel,
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

test("adaptation changes entry mode and challenge intensity without naming content", () => {
  assert.deepEqual(adaptationForSelfAssessedAiLevel("beginner"), {
    explanationDepth: "foundational",
    preferredEntryMode: "guided",
    challengeIntensity: "introductory",
  });
  assert.deepEqual(adaptationForSelfAssessedAiLevel("intermediate"), {
    explanationDepth: "balanced",
    preferredEntryMode: "guided",
    challengeIntensity: "standard",
  });
  assert.deepEqual(adaptationForSelfAssessedAiLevel("advanced"), {
    explanationDepth: "concise",
    preferredEntryMode: "challenge",
    challengeIntensity: "high",
  });
});
