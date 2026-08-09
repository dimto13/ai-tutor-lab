import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeGuidedStepProgress } from "../../src/state/trainingProgress.ts";
import type { Scenario } from "../../src/types/training.ts";

const scenario = {
  id: "migration.guided",
  mode: "guided",
  steps: [
    { id: "intro-code", optional: true },
    { id: "intro-context", optional: true },
    { id: "open-tool" },
    { id: "finish-task" },
  ],
} as unknown as Scenario;

test("guided progress migration preserves a completed legacy session", () => {
  const normalized = normalizeGuidedStepProgress(
    scenario,
    {
      statuses: {
        "open-tool": "COMPLETED",
        "finish-task": "COMPLETED",
        "removed-legacy-step": "COMPLETED",
      },
      activeStepId: null,
      finishedAt: 1_786_280_000_000,
    },
    1_786_290_000_000,
  );

  assert.deepEqual(normalized.statuses, {
    "intro-code": "SKIPPED",
    "intro-context": "SKIPPED",
    "open-tool": "COMPLETED",
    "finish-task": "COMPLETED",
  });
  assert.equal(normalized.activeStepId, null);
  assert.equal(normalized.finishedAt, 1_786_280_000_000);
});

test("guided progress migration keeps a partial legacy session actionable", () => {
  const normalized = normalizeGuidedStepProgress(scenario, {
    statuses: {
      "open-tool": "COMPLETED",
      "finish-task": "NOT_STARTED",
    },
    activeStepId: null,
    finishedAt: 1_786_280_000_000,
  });

  assert.deepEqual(normalized.statuses, {
    "intro-code": "SKIPPED",
    "intro-context": "SKIPPED",
    "open-tool": "COMPLETED",
    "finish-task": "ACTIVE",
  });
  assert.equal(normalized.activeStepId, "finish-task");
  assert.equal(normalized.finishedAt, null);
});

test("guided progress migration preserves one valid failed or active step", () => {
  const normalized = normalizeGuidedStepProgress(scenario, {
    statuses: {
      "intro-code": "COMPLETED",
      "intro-context": "SKIPPED",
      "open-tool": "ACTIVE",
      "finish-task": "VALIDATION_FAILED",
    },
    activeStepId: "finish-task",
    finishedAt: null,
  });

  assert.equal(normalized.statuses["open-tool"], "NOT_STARTED");
  assert.equal(normalized.statuses["finish-task"], "VALIDATION_FAILED");
  assert.equal(normalized.activeStepId, "finish-task");
  assert.equal(normalized.finishedAt, null);
});
