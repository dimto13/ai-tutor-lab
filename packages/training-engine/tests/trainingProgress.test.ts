import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGuidedStepProgress } from "../src/trainingProgress.ts";
import type { Scenario } from "../src/types.ts";

const scenario = {
  id: "engine.contract",
  title: "Engine contract",
  description: "",
  steps: [
    {
      id: "one",
      title: "one",
      description: "",
      instruction: "",
      why: "",
      helpLevels: ["a", "b", "c"],
      successMessage: "",
    },
    {
      id: "two",
      title: "two",
      description: "",
      instruction: "",
      why: "",
      helpLevels: ["a", "b", "c"],
      successMessage: "",
    },
  ],
} satisfies Scenario;

test("guided progress normalizes to exactly one active step", () => {
  const progress = normalizeGuidedStepProgress(scenario, {
    statuses: { one: "ACTIVE", two: "ACTIVE" },
    activeStepId: "one",
    finishedAt: null,
  });
  assert.equal(Object.values(progress.statuses).filter((status) => status === "ACTIVE").length, 1);
  assert.equal(progress.activeStepId, "one");
});
