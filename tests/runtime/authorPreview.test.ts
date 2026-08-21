import assert from "node:assert/strict";
import test from "node:test";
import type { Scenario, TrainingStep } from "../../packages/training-engine/src/types.ts";
import {
  resolveAuthorHighlightTarget,
  simulateAuthorStepValidation,
  suggestAuthorEventType,
} from "../../apps/web/src/authoring/authorPreview.ts";

const step: TrainingStep = {
  id: "open-explorer",
  title: "Explorer öffnen",
  description: "Explorer sichtbar machen",
  instruction: "Öffne den Explorer.",
  helpLevels: ["Hinweis", "Öffne die Activity Bar", "Wähle Explorer"],
  validation: { kind: "event", type: "explorer.opened" },
  highlightTarget: "vscode.activityBar.explorer",
  successMessage: "Explorer geöffnet",
};

const scenario: Scenario = {
  id: "author-preview-fixture",
  title: "Autorenvorschau Fixture",
  description: "Test",
  environment: {
    productId: "vscode",
    version: "1.131",
    runtimeAdapterId: "vscode-simulator",
  },
  steps: [step],
};

test("author preview resolves semantic highlight targets through the runtime contract", () => {
  assert.deepEqual(resolveAuthorHighlightTarget(scenario, step), {
    status: "resolved",
    target: "vscode.activityBar.explorer",
    runtimeId: "vscode-simulator",
    runtimeProductId: "vscode",
    label: "Explorer",
  });
});

test("author preview reports unknown targets instead of guessing DOM selectors", () => {
  const unresolved = { ...step, highlightTarget: "vscode.does-not-exist" };
  assert.deepEqual(resolveAuthorHighlightTarget(scenario, unresolved), {
    status: "missing",
    target: "vscode.does-not-exist",
  });
});

test("author preview suggests and executes the authored event validator", async () => {
  assert.equal(suggestAuthorEventType(step), "explorer.opened");
  assert.deepEqual(
    await simulateAuthorStepValidation(scenario, step, {
      type: "explorer.opened",
      payload: {},
    }),
    { outcome: "pass" },
  );
  assert.deepEqual(
    await simulateAuthorStepValidation(scenario, step, {
      type: "file.opened",
      payload: {},
    }),
    { outcome: "ignore" },
  );
});
