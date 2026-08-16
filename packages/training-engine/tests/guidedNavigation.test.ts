import assert from "node:assert/strict";
import test from "node:test";
import { canNavigateToGuidedStep } from "../src/guidedNavigation.ts";
import {
  completeTrainingStep,
  createTrainingSession,
  skipOptionalStep,
} from "../src/stateMachine.ts";
import type { Scenario } from "../src/types.ts";

const scenario = {
  id: "navigation.guided",
  mode: "guided",
  title: "Navigation",
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
      id: "optional",
      optional: true,
      title: "Optional",
      description: "",
      instruction: "Optional",
      helpLevels: ["a", "b", "c"],
      successMessage: "done",
    },
    {
      id: "three",
      title: "Three",
      description: "",
      instruction: "Three",
      helpLevels: ["a", "b", "c"],
      successMessage: "done",
    },
    {
      id: "four",
      title: "Four",
      description: "",
      instruction: "Four",
      helpLevels: ["a", "b", "c"],
      successMessage: "done",
    },
    {
      id: "five",
      title: "Five",
      description: "",
      instruction: "Five",
      helpLevels: ["a", "b", "c"],
      successMessage: "done",
    },
  ],
} satisfies Scenario;

test("guided navigation allows completed and canonical active steps but blocks skipped and future steps", () => {
  const initial = createTrainingSession(scenario, "session", 100);
  const completedOne = completeTrainingStep(initial, scenario, "one", 110);
  const skippedOptional = skipOptionalStep(completedOne, scenario, "optional", 120);
  const reachedThree = completeTrainingStep(skippedOptional, scenario, "three", 130);
  const before = structuredClone(reachedThree);

  assert.equal(reachedThree.activeStepId, "four");
  assert.equal(canNavigateToGuidedStep(reachedThree, scenario, "one"), true);
  assert.equal(canNavigateToGuidedStep(reachedThree, scenario, "optional"), false);
  assert.equal(canNavigateToGuidedStep(reachedThree, scenario, "three"), true);
  assert.equal(canNavigateToGuidedStep(reachedThree, scenario, "four"), true);
  assert.equal(canNavigateToGuidedStep(reachedThree, scenario, "five"), false);
  assert.deepEqual(reachedThree, before);
});

test("guided navigation does not reopen a finished session", () => {
  let session = createTrainingSession(scenario, "session", 100);
  session = completeTrainingStep(session, scenario, "one", 110);
  session = skipOptionalStep(session, scenario, "optional", 120);
  session = completeTrainingStep(session, scenario, "three", 130);
  session = completeTrainingStep(session, scenario, "four", 140);
  session = completeTrainingStep(session, scenario, "five", 150);

  assert.equal(session.finishedAt, 150);
  assert.equal(canNavigateToGuidedStep(session, scenario, "one"), false);
  assert.equal(canNavigateToGuidedStep(session, scenario, "five"), false);
});
