import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

interface GuidedStep {
  id: string;
  validation?: { kind: string; type?: string };
  highlightTarget?: string;
}

interface GuidedScenario {
  steps: GuidedStep[];
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8")) as T;
}

const developerWorkflow = readJson<GuidedScenario>(
  "../../content/scenarios/developer-workflow-basics.guided.json",
);

function expectAtomicStep(stepId: string, eventType: string, highlightTarget: string): void {
  const step = developerWorkflow.steps.find((candidate) => candidate.id === stepId);
  assert.equal(step?.validation?.kind, "event");
  assert.equal(step?.validation?.type, eventType);
  assert.equal(step?.highlightTarget, highlightTarget);
}

test("guided highlight targets stay aligned with atomic Copilot workflow actions", () => {
  expectAtomicStep("step_4", "copilot.chat.opened", "copilot.chat.toggle");
  expectAtomicStep("step_5", "copilot.context.changed", "copilot.chat.addContext");
  expectAtomicStep("step_6", "copilot.prompt.submitted", "copilot.chat.prompt");
  expectAtomicStep("step_7", "ai.suggestion.accepted", "vscode.editor");
});

test("guided steps that ask to check the dirty tab keep the tab bar as context surface (#454)", async () => {
  const { VSCODE_RUNTIME_DEFINITION } =
    await import("../../packages/runtime-vscode-sim/src/vscodeDefinition.ts");
  const surfaceRefs = new Set(VSCODE_RUNTIME_DEFINITION.surface.map((entry) => entry.ref));
  assert.ok(surfaceRefs.has("vscode.editor.tabs"));

  const vscodeBasics = readJson<GuidedScenario & { steps: Array<{ contextTargets?: string[] }> }>(
    "../../content/scenarios/vscode-basics.guided.json",
  );
  const editFile = vscodeBasics.steps.find((step) => step.id === "edit_file");
  assert.equal(editFile?.highlightTarget, "vscode.editor");
  assert.deepEqual(editFile?.contextTargets, ["vscode.editor.tabs"]);

  const saveStep = (
    developerWorkflow as GuidedScenario & { steps: Array<{ contextTargets?: string[] }> }
  ).steps.find((step) => step.id === "step_8");
  assert.deepEqual(saveStep?.contextTargets, ["vscode.editor.tabs"]);
});
