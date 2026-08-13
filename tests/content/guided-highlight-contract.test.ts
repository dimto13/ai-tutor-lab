import { describe, expect, it } from "vitest";
import { getScenario } from "../../apps/web/src/scenarios/index.ts";

describe("guided highlight authoring contract", () => {
  it("keeps the combined developer workflow aligned with the action that can complete the step", () => {
    const scenario = getScenario("git-basics");
    expect(scenario).toBeDefined();

    const inlineStep = scenario?.steps.find((step) => step.id === "step_4");
    expect(inlineStep?.validation).toMatchObject({
      kind: "event",
      type: "ai.suggestion.accepted",
    });
    expect(inlineStep?.highlightTarget).toBe("copilot.inline.accept");

    const chatStep = scenario?.steps.find((step) => step.id === "step_8");
    expect(chatStep?.validation).toMatchObject({
      kind: "event",
      type: "copilot.prompt.submitted",
    });
    expect(chatStep?.highlightTarget).toBe("vscode.secondarySideBar");
  });
});
