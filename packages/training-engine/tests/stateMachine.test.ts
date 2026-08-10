import assert from "node:assert/strict";
import test from "node:test";
import {
  applyValidationResult,
  assertSessionInvariant,
  createTrainingSession,
  skipOptionalStep,
} from "../src/stateMachine.ts";
import type { Scenario, TrainingStep } from "../src/types.ts";

function step(id: string, optional = false): TrainingStep {
  return {
    id,
    title: id,
    description: "",
    instruction: id,
    why: id,
    helpLevels: ["hint", "instruction", "visual"],
    successMessage: "done",
    ...(optional ? { optional: true } : {}),
  };
}

const scenario = {
  id: "engine.guided",
  moduleId: "engine",
  mode: "guided",
  title: "Engine",
  description: "",
  steps: [step("one"), step("two", true), step("three")],
} satisfies Scenario;

test("a new guided session has exactly one ACTIVE step", () => {
  const session = createTrainingSession(scenario, "session-1", 100);

  assert.equal(session.activeStepId, "one");
  assert.deepEqual(session.statuses, {
    one: "ACTIVE",
    two: "NOT_STARTED",
    three: "NOT_STARTED",
  });
  assert.doesNotThrow(() => assertSessionInvariant(session));
});

test("near-miss counts one attempt while ignore leaves progress untouched", () => {
  const initial = createTrainingSession(scenario, "session-1", 100);
  const ignored = applyValidationResult(initial, scenario, "one", { outcome: "ignore" }, 110);
  const failed = applyValidationResult(
    ignored,
    scenario,
    "one",
    { outcome: "near-miss", message: "Wrong filename" },
    120,
  );

  assert.equal(ignored, initial);
  assert.equal(failed.statuses.one, "VALIDATION_FAILED");
  assert.equal(failed.activeStepId, "one");
  assert.equal(failed.mistakes, 1);
  assert.equal(failed.attempts.length, 1);
  assert.equal(failed.attempts[0]?.message, "Wrong filename");
});

test("pass advances from VALIDATION_FAILED and preserves mistakes", () => {
  const initial = createTrainingSession(scenario, "session-1", 100);
  const failed = applyValidationResult(initial, scenario, "one", { outcome: "near-miss" }, 110);
  const passed = applyValidationResult(failed, scenario, "one", { outcome: "pass" }, 120);

  assert.equal(passed.statuses.one, "COMPLETED");
  assert.equal(passed.statuses.two, "ACTIVE");
  assert.equal(passed.activeStepId, "two");
  assert.equal(passed.mistakes, 1);
  assert.equal(passed.attempts.length, 2);
});

test("optional steps can be skipped without creating a failed attempt", () => {
  const initial = createTrainingSession(scenario, "session-1", 100);
  const afterOne = applyValidationResult(initial, scenario, "one", { outcome: "pass" }, 110);
  const skipped = skipOptionalStep(afterOne, scenario, "two", 120);

  assert.equal(skipped.statuses.two, "SKIPPED");
  assert.equal(skipped.statuses.three, "ACTIVE");
  assert.equal(skipped.activeStepId, "three");
  assert.equal(skipped.mistakes, 0);
});
