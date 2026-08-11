import assert from "node:assert/strict";
import test from "node:test";
import {
  activeHelpLevel,
  applyValidationResult,
  assertSessionInvariant,
  completeChallenge,
  createTrainingSession,
  inspectExploreTarget,
  recordHintUsage,
  restoreTrainingSession,
  skipConsecutiveOptionalSteps,
  skipOptionalStep,
  timeoutChallenge,
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
  assert.equal(session.activeStepMistakes, 0);
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
  assert.equal(failed.statuses["one"], "VALIDATION_FAILED");
  assert.equal(failed.activeStepId, "one");
  assert.equal(failed.mistakes, 1);
  assert.equal(failed.activeStepMistakes, 1);
  assert.equal(failed.attempts.length, 1);
  assert.equal(failed.attempts[0]?.message, "Wrong filename");
});

test("non-counting near-miss leaves session state untouched", () => {
  const initial = createTrainingSession(scenario, "session-1", 100);
  const ignoredTypingMiss = applyValidationResult(
    initial,
    scenario,
    "one",
    { outcome: "near-miss" },
    110,
    { countNearMiss: false },
  );

  assert.equal(ignoredTypingMiss, initial);
});

test("pass advances from VALIDATION_FAILED and preserves total mistakes", () => {
  const initial = createTrainingSession(scenario, "session-1", 100);
  const failed = applyValidationResult(initial, scenario, "one", { outcome: "near-miss" }, 110);
  const passed = applyValidationResult(failed, scenario, "one", { outcome: "pass" }, 120);

  assert.equal(passed.statuses["one"], "COMPLETED");
  assert.equal(passed.statuses["two"], "ACTIVE");
  assert.equal(passed.activeStepId, "two");
  assert.equal(passed.mistakes, 1);
  assert.equal(passed.activeStepMistakes, 0);
  assert.equal(passed.attempts.length, 2);
});

test("optional steps can be skipped without creating a failed attempt", () => {
  const initial = createTrainingSession(scenario, "session-1", 100);
  const afterOne = applyValidationResult(initial, scenario, "one", { outcome: "pass" }, 110);
  const skipped = skipOptionalStep(afterOne, scenario, "two", 120);

  assert.equal(skipped.statuses["two"], "SKIPPED");
  assert.equal(skipped.statuses["three"], "ACTIVE");
  assert.equal(skipped.activeStepId, "three");
  assert.equal(skipped.mistakes, 0);
});

test("consecutive optional steps are skipped by the engine", () => {
  const optionalScenario = {
    ...scenario,
    id: "engine.optional-block",
    steps: [step("intro-a", true), step("intro-b", true), step("action")],
  } satisfies Scenario;
  const initial = createTrainingSession(optionalScenario, "session-1", 100);
  const skipped = skipConsecutiveOptionalSteps(initial, optionalScenario, 110);

  assert.equal(skipped.statuses["intro-a"], "SKIPPED");
  assert.equal(skipped.statuses["intro-b"], "SKIPPED");
  assert.equal(skipped.statuses["action"], "ACTIVE");
  assert.equal(skipped.activeStepId, "action");
});

test("hint usage and active help level are canonical session state", () => {
  const initial = createTrainingSession(scenario, "session-1", 100);
  const first = recordHintUsage(initial, "one", 1, 110);
  const second = recordHintUsage(first, "one", 2, 120);

  assert.equal(second.hintsUsed, 2);
  assert.equal(second.hintUsage.length, 2);
  assert.equal(activeHelpLevel(second), 2);
});

test("legacy browser progress is restored into the canonical session", () => {
  const restored = restoreTrainingSession(
    scenario,
    "engine.guided",
    {
      statuses: { one: "COMPLETED", two: "ACTIVE", three: "NOT_STARTED" },
      activeStepId: "two",
      startedAt: 50,
      hintsUsed: 1,
      hintUsage: [{ stepId: "two", level: 1, timestamp: 60 }],
      mistakes: 2,
      activeStepMistakes: 1,
      lastAction: "file.created",
    },
    100,
  );

  assert.equal(restored.id, "engine.guided");
  assert.equal(restored.scenarioId, scenario.id);
  assert.equal(restored.mode, "guided");
  assert.equal(restored.activeStepId, "two");
  assert.equal(restored.startedAt, 50);
  assert.equal(restored.hintsUsed, 1);
  assert.equal(restored.mistakes, 2);
  assert.equal(restored.lastAction, "file.created");
});

test("explore progress and completion are engine transitions", () => {
  const exploreScenario = {
    ...scenario,
    id: "engine.explore",
    mode: "explore",
    exploreTargets: ["vscode.activityBar", "vscode.editor"],
  } satisfies Scenario;
  const initial = createTrainingSession(exploreScenario, "session-1", 100);
  const first = inspectExploreTarget(initial, exploreScenario, "vscode.activityBar", 110);
  const finished = inspectExploreTarget(first, exploreScenario, "vscode.editor", 120);

  assert.equal(initial.activeStepId, null);
  assert.deepEqual(first.exploredTargets, ["vscode.activityBar"]);
  assert.equal(first.finishedAt, null);
  assert.deepEqual(finished.exploredTargets, ["vscode.activityBar", "vscode.editor"]);
  assert.equal(finished.finishedAt, 120);
});

test("challenge pass and timeout are engine transitions", () => {
  const challengeScenario = {
    ...scenario,
    id: "engine.challenge",
    mode: "challenge",
    timeLimitSeconds: 60,
  } satisfies Scenario;
  const initial = createTrainingSession(challengeScenario, "session-1", 100);
  const passed = completeChallenge(initial, challengeScenario, 120);
  const timedOut = timeoutChallenge(initial, challengeScenario);

  assert.equal(passed.challengeOutcome, "passed");
  assert.equal(passed.statuses["one"], "COMPLETED");
  assert.equal(passed.finishedAt, 120);
  assert.equal(timedOut.challengeOutcome, "timed_out");
  assert.equal(timedOut.statuses["one"], "VALIDATION_FAILED");
  assert.equal(timedOut.activeStepId, null);
});
