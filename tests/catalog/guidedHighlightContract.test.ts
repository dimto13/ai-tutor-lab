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

test("guided highlight targets stay aligned with the active workflow action", () => {
  const inlineStep = developerWorkflow.steps.find((step) => step.id === "step_4");
  assert.deepEqual(inlineStep?.validation, {
    kind: "event",
    type: "ai.suggestion.accepted",
    match: { file: "hello.py" },
    contains: { text: "Hello from Copilot" },
  });
  assert.equal(inlineStep?.highlightTarget, "copilot.inline.accept");

  const chatStep = developerWorkflow.steps.find((step) => step.id === "step_8");
  assert.deepEqual(chatStep?.validation, {
    kind: "event",
    type: "copilot.prompt.submitted",
    match: { activeFile: "hello.py" },
  });
  assert.equal(chatStep?.highlightTarget, "vscode.secondarySideBar");
});
