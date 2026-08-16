import assert from "node:assert/strict";
import test from "node:test";
import { resumeGuidedStepAfterRecovery } from "../src/guidedRecovery.ts";
import { applyValidationResult, createTrainingSession } from "../src/stateMachine.ts";
import type { Scenario } from "../src/types.ts";

const scenario = {
  id: "recovery.guided",
  mode: "guided",
  title: "Recovery",
  description: "",
  steps: [
    {
      id: "one",
      title: "One",
      description: "",
      instruction: "One",
      helpLevels: ["a", "b", "c"],
      successMessage: "done",
    },
    {
      id: "two",
      title: "Two",
      description: "",
      instruction: "Two",
      helpLevels: ["a", "b", "c"],
      successMessage: "done",
    },
  ],
} satisfies Scenario;

test("recovery reactivates only the failed active step and preserves attempt history", () => {
  const initial = createTrainingSession(scenario, "session", 100);
  const failed = applyValidationResult(
    initial,
    scenario,
    "one",
    { outcome: "near-miss", message: "wrong state" },
    110,
  );

  const recovered = resumeGuidedStepAfterRecovery(failed, "one");

  assert.equal(recovered.statuses["one"], "ACTIVE");
  assert.equal(recovered.activeStepId, "one");
  assert.deepEqual(recovered.attempts, failed.attempts);
  assert.equal(recovered.mistakes, failed.mistakes);
  assert.equal(recovered.activeStepMistakes, failed.activeStepMistakes);
  assert.equal(recovered.finishedAt, null);
});

test("recovery cannot reopen completed progress", () => {
  const initial = createTrainingSession(scenario, "session", 100);
  const completedFirst = applyValidationResult(initial, scenario, "one", { outcome: "pass" }, 110);

  const unchanged = resumeGuidedStepAfterRecovery(completedFirst, "one");

  assert.equal(unchanged, completedFirst);
  assert.equal(unchanged.statuses["one"], "COMPLETED");
  assert.equal(unchanged.statuses["two"], "ACTIVE");
});
