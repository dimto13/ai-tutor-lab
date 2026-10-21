import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  createDefaultValidatorRegistry,
  reportsNearMiss,
  stepFailureMessage,
} from "@ai-train-lab/training-engine";
import { createM365CopilotRuntime } from "../../apps/web/src/runtime/m365CopilotRuntime.ts";
import { parseScenario } from "../../apps/web/src/scenarios/contentLoader.ts";

// Drives the authored M365 Guided steps against the real runtime, as the store does after an action.
const raw = await readFile(
  path.resolve("content/scenarios/m365-copilot-basics.guided.json"),
  "utf8",
);
const scenario = parseScenario(JSON.parse(raw));
const registry = createDefaultValidatorRegistry();

function step(id: string) {
  const found = scenario.steps.find((candidate) => candidate.id === id);
  assert.ok(found?.validation, id);
  return found as typeof found & { validation: NonNullable<typeof found.validation> };
}

const quality = {
  goal: true,
  context: true,
  audience: true,
  tone: true,
  outputFormat: true,
};

test("#591: the first of two required sources is progress, not a failed attempt", async () => {
  const runtime = createM365CopilotRuntime();
  const sources = step("guided-select-approved-sources");
  runtime.setContextSource("meeting-notes", true);
  const partial = await registry.validate(sources.validation, {
    query: (selector) => runtime.query(selector),
  });
  assert.equal(partial.outcome, "near-miss");
  assert.equal(reportsNearMiss(sources, partial), false);

  runtime.setContextSource("project-brief", true);
  assert.equal(
    (await registry.validate(sources.validation, { query: (selector) => runtime.query(selector) }))
      .outcome,
    "pass",
  );
});

test("#591: a prompt without audience says what is missing instead of a generic failure", async () => {
  const runtime = createM365CopilotRuntime();
  const prompt = step("guided-send-prompt");
  const query = (selector: string) => runtime.query(selector);
  runtime.setContextSource("meeting-notes", true);
  runtime.setContextSource("project-brief", true);

  // Before sending, any other action on the step stays silent.
  const unsent = await registry.validate(prompt.validation, { query });
  assert.equal(reportsNearMiss(prompt, unsent), false);

  for (const missing of ["goal", "audience", "tone", "outputFormat"] as const) {
    runtime.submitPrompt({ ...quality, [missing]: false });
    const result = await registry.validate(prompt.validation, { query });
    assert.equal(result.outcome, "near-miss", missing);
    assert.equal(reportsNearMiss(prompt, result), true, missing);
    assert.equal(
      stepFailureMessage(prompt, result),
      prompt.onFailure?.fieldMessages?.[`m365.prompt.quality.${missing}`],
      missing,
    );
  }

  runtime.submitPrompt(quality);
  assert.equal((await registry.validate(prompt.validation, { query })).outcome, "pass");
});
