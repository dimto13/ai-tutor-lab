import assert from "node:assert/strict";
import test from "node:test";
import { assertSkillThresholds, resolveSkillLevel } from "../src/skillProfile.ts";

const thresholds = [
  { id: "novice", minPoints: 0, requiresEligibleChallenge: false },
  { id: "advanced_beginner", minPoints: 1, requiresEligibleChallenge: false },
  { id: "practitioner", minPoints: 200, requiresEligibleChallenge: true },
  { id: "proficient", minPoints: 500, requiresEligibleChallenge: true },
] as const;

test("resolves zero evidence as novice", () => {
  assert.equal(resolveSkillLevel({ points: 0, eligibleChallengeCount: 0 }, thresholds), "novice");
});

test("moves to Advanced Beginner with measured points", () => {
  assert.equal(
    resolveSkillLevel({ points: 60, eligibleChallengeCount: 0 }, thresholds),
    "advanced_beginner",
  );
});

test("Practitioner requires an evidence-eligible challenge even above the point threshold", () => {
  assert.equal(
    resolveSkillLevel({ points: 450, eligibleChallengeCount: 0 }, thresholds),
    "advanced_beginner",
  );
  assert.equal(
    resolveSkillLevel({ points: 450, eligibleChallengeCount: 1 }, thresholds),
    "practitioner",
  );
});

test("Proficient requires both points and challenge evidence", () => {
  assert.equal(
    resolveSkillLevel({ points: 535, eligibleChallengeCount: 0 }, thresholds),
    "advanced_beginner",
  );
  assert.equal(
    resolveSkillLevel({ points: 535, eligibleChallengeCount: 1 }, thresholds),
    "proficient",
  );
});

test("rejects reordered or non-increasing threshold policies", () => {
  assert.throws(
    () =>
      assertSkillThresholds([
        thresholds[0],
        thresholds[2],
        thresholds[1],
        thresholds[3],
      ]),
    /must follow/,
  );
  assert.throws(
    () =>
      assertSkillThresholds([
        thresholds[0],
        { ...thresholds[1], minPoints: 0 },
        thresholds[2],
        thresholds[3],
      ]),
    /strictly increasing/,
  );
});
