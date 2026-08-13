import { describe, expect, it } from "vitest";
import developerWorkflow from "../../content/scenarios/developer-workflow-basics.guided.json";

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
