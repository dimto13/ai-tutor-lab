import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const providerUrl = new URL("../../../apps/web/src/state/trainingStore.tsx", import.meta.url);
const persistenceUrl = new URL(
  "../../../apps/web/src/state/trainingStatePersistence.ts",
  import.meta.url,
);

test("web TrainingProvider delegates domain state and persistence boundaries", async () => {
  const [providerSource, persistenceSource] = await Promise.all([
    readFile(providerUrl, "utf8"),
    readFile(persistenceUrl, "utf8"),
  ]);

  for (const engineApi of [
    "applyValidationResult",
    "completeTrainingStep",
    "createDefaultValidatorRegistry",
    "createTrainingSession",
    "inspectExploreTarget",
    "completeChallenge",
    "timeoutChallenge",
    "recordHintUsage",
    "recordMistake",
  ]) {
    assert.match(
      providerSource,
      new RegExp(`\\b${engineApi}\\b`),
      `TrainingProvider must use ${engineApi}`,
    );
  }

  assert.match(
    providerSource,
    /\bTrainingStatePersistence\b/,
    "TrainingProvider must delegate persistence coordination",
  );
  assert.match(
    persistenceSource,
    /\brestoreTrainingSession\b/,
    "Persistence coordinator must delegate session restoration to training-engine",
  );
  assert.doesNotMatch(
    providerSource,
    /\blocalStorage\b/,
    "TrainingProvider must not access browser storage directly",
  );

  assert.doesNotMatch(providerSource, /function\s+initialProgress\s*\(/);
  assert.doesNotMatch(providerSource, /function\s+validateEvent\s*\(/);
  assert.doesNotMatch(providerSource, /function\s+validateState\s*\(/);
  assert.doesNotMatch(providerSource, /function\s+normalizeComparableText\s*\(/);
  assert.doesNotMatch(providerSource, /function\s+containsNormalizedFragment\s*\(/);
});
