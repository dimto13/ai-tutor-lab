import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDefaultValidatorRegistry,
  type EngineValidationResult,
  type TrainingEvent,
  type Validation,
} from "@ai-train-lab/training-engine";
import rawScenario from "../../content/scenarios/claude-code-basics.guided.json" with { type: "json" };
import { parseScenario } from "../../apps/web/src/scenarios/contentLoader.ts";
import {
  createClaudeCodeRuntime,
  type ClaudeCodeRuntimeAdapter,
} from "../../apps/web/src/runtime/claudeCodeRuntime.ts";

/**
 * End-to-end generizität proof for AITP-25: the authored scenario is loaded by
 * the production content loader and validated by the unchanged training engine
 * against the Claude Code adapter. No engine-side registration is involved.
 */

function createContainer(): HTMLElement {
  return { querySelector: () => null } as unknown as HTMLElement;
}

const registry = createDefaultValidatorRegistry();

/** Mirrors how the engine feeds runtime events into a step validation. */
async function evaluateStep(
  validation: Validation,
  events: readonly TrainingEvent[],
  query: (selector: string) => Promise<unknown>,
): Promise<EngineValidationResult> {
  let fallback: EngineValidationResult = await registry.validate(validation, { query });
  for (const event of events) {
    const result = await registry.validate(validation, { event, events: [event], query });
    if (result.outcome === "pass") return result;
    if (result.outcome === "near-miss") fallback = result;
  }
  return fallback;
}

type StepAction = (runtime: ClaudeCodeRuntimeAdapter) => void;

const stepActions: Record<string, StepAction> = {
  "start-agent-session": (runtime) => runtime.startSession(),
  "list-workspace-files": (runtime) => runtime.runCommand("ls"),
  "ask-agent-for-change": (runtime) =>
    runtime.submitPrompt("Ergänze in der README einen Abschnitt mit den ersten Schritten"),
  "inspect-proposed-change": (runtime) => runtime.openProposedChange(),
  "approve-proposed-change": (runtime) => runtime.approvePendingChange(),
};

async function mountScenarioRuntime(): Promise<{
  runtime: ClaudeCodeRuntimeAdapter;
  drain: () => TrainingEvent[];
  dispose: () => Promise<void>;
}> {
  const scenario = parseScenario(rawScenario);
  const runtime = createClaudeCodeRuntime();
  let buffer: TrainingEvent[] = [];
  const unsubscribe = runtime.subscribe((event) => buffer.push(event));
  await runtime.mount(createContainer(), scenario.environment?.seed);
  return {
    runtime,
    drain: () => {
      const events = buffer;
      buffer = [];
      return events;
    },
    dispose: async () => {
      unsubscribe();
      await runtime.unmount();
    },
  };
}

test("claude-code-basics.guided: loads through the production content loader", () => {
  const scenario = parseScenario(rawScenario);

  assert.equal(scenario.environment?.productId, "claude-code");
  assert.equal(scenario.environment?.runtimeAdapterId, "claude-code-cli-simulator");
  assert.equal(scenario.environment?.integrations, undefined);
  assert.ok(
    scenario.steps.length >= 4,
    `mini scenario needs at least four steps, got ${scenario.steps.length}`,
  );
  for (const step of scenario.steps) {
    assert.ok(step.validation, `step ${step.id} needs a validation to be playable`);
  }
});

test("claude-code-basics.guided: no step depends on explore-only inspection events", () => {
  const scenario = parseScenario(rawScenario);

  // Workspace components only forward `inspect()` in explore mode, so a guided
  // step validating on `ui.element.inspected` could never be completed.
  const eventTypes: string[] = [];
  const collect = (validation: Validation | undefined): void => {
    if (!validation) return;
    if (validation.kind === "event") eventTypes.push(validation.type);
    if (validation.kind === "all" || validation.kind === "any" || validation.kind === "sequence") {
      validation.of.forEach(collect);
    }
    if (validation.kind === "not") collect(validation.of);
  };
  scenario.steps.forEach((step) => collect(step.validation));

  assert.ok(eventTypes.length > 0);
  assert.equal(
    eventTypes.includes("ui.element.inspected"),
    false,
    "guided steps must validate on real learner actions, not explore-only inspection",
  );
});

test("claude-code-basics.guided: every step validates against the unchanged engine", async () => {
  const scenario = parseScenario(rawScenario);
  const { runtime, drain, dispose } = await mountScenarioRuntime();

  try {
    for (const step of scenario.steps) {
      const action = stepActions[step.id];
      assert.ok(action, `no learner action mapped for step ${step.id}`);

      drain();
      action(runtime);
      const result = await evaluateStep(step.validation as Validation, drain(), (selector) =>
        runtime.query(selector),
      );

      assert.equal(
        result.outcome,
        "pass",
        `step ${step.id} did not pass: ${result.outcome}${
          result.message ? ` – ${result.message}` : ""
        }`,
      );
    }

    const contents = await runtime.query<Record<string, string>>("claude.files.contents");
    assert.match(contents["README.md"] ?? "", /## Erste Schritte/);
    assert.deepEqual(await runtime.query("claude.changes.applied"), ["readme-installation"]);
  } finally {
    await dispose();
  }
});

test("claude-code-basics.guided: the approval step is not satisfied by rejecting the change", async () => {
  const scenario = parseScenario(rawScenario);
  const approvalStep = scenario.steps.find((step) => step.id === "approve-proposed-change");
  assert.ok(approvalStep?.validation);

  const { runtime, drain, dispose } = await mountScenarioRuntime();

  try {
    runtime.startSession();
    runtime.submitPrompt("Ergänze in der README einen Abschnitt mit den ersten Schritten");
    drain();

    runtime.rejectPendingChange();
    const result = await evaluateStep(approvalStep.validation as Validation, drain(), (selector) =>
      runtime.query(selector),
    );

    assert.notEqual(result.outcome, "pass");
    const contents = await runtime.query<Record<string, string>>("claude.files.contents");
    assert.doesNotMatch(contents["README.md"] ?? "", /## Erste Schritte/);
  } finally {
    await dispose();
  }
});

test("claude-code-basics.guided: an unrelated prompt does not satisfy the instruction step", async () => {
  const scenario = parseScenario(rawScenario);
  const promptStep = scenario.steps.find((step) => step.id === "ask-agent-for-change");
  assert.ok(promptStep?.validation);

  const { runtime, drain, dispose } = await mountScenarioRuntime();

  try {
    runtime.startSession();
    drain();

    runtime.submitPrompt("Wie spät ist es?");
    const result = await evaluateStep(promptStep.validation as Validation, drain(), (selector) =>
      runtime.query(selector),
    );

    assert.notEqual(result.outcome, "pass");
    assert.equal(await runtime.query("claude.pendingChange.id"), null);
  } finally {
    await dispose();
  }
});
