import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const providerUrl = new URL("../../../apps/web/src/state/trainingStore.tsx", import.meta.url);

test("web TrainingProvider delegates domain state and validation to training-engine", async () => {
  const source = await readFile(providerUrl, "utf8");

  for (const engineApi of [
    "applyValidationResult",
    "completeTrainingStep",
    "createDefaultValidatorRegistry",
    "createTrainingSession",
    "restoreTrainingSession",
    "inspectExploreTarget",
    "completeChallenge",
    "timeoutChallenge",
    "recordHintUsage",
    "recordMistake",
  ]) {
    assert.match(
      source,
      new RegExp(`\\b${engineApi}\\b`),
      `TrainingProvider must use ${engineApi}`,
    );
  }

  assert.doesNotMatch(source, /function\s+initialProgress\s*\(/);
  assert.doesNotMatch(source, /function\s+validateEvent\s*\(/);
  assert.doesNotMatch(source, /function\s+validateState\s*\(/);
  assert.doesNotMatch(source, /function\s+normalizeComparableText\s*\(/);
  assert.doesNotMatch(source, /function\s+containsNormalizedFragment\s*\(/);
});
