import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const developerWorkflow = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "content/scenarios/developer-workflow-basics.guided.json"),
    "utf8",
  ),
) as {
  steps: Array<{
    id: string;
    validation?: { kind: string; type?: string };
    highlightTarget?: string;
  }>;
};

describe("guided highlight authoring contract", () => {
  it("keeps the combined developer workflow aligned with the action that can complete the step", () => {
    const inlineStep = developerWorkflow.steps.find((step) => step.id === "step_4");
    expect(inlineStep?.validation).toMatchObject({
      kind: "event",
      type: "ai.suggestion.accepted",
    });
    expect(inlineStep?.highlightTarget).toBe("copilot.inline.accept");

    const chatStep = developerWorkflow.steps.find((step) => step.id === "step_8");
    expect(chatStep?.validation).toMatchObject({
      kind: "event",
      type: "copilot.prompt.submitted",
    });
    expect(chatStep?.highlightTarget).toBe("vscode.secondarySideBar");
  });
});
