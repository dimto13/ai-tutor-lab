import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  createDefaultValidatorRegistry,
  reportsNearMiss,
  stepFailureMessage,
  type TrainingEvent,
} from "@ai-train-lab/training-engine";
import { parseScenario } from "../../apps/web/src/scenarios/contentLoader.ts";

// Former keyword gates (#599): own wording that missed every listed word now finishes the step,
// and a too short or misplaced prompt names what is missing.
const registry = createDefaultValidatorRegistry();

async function authoredStep(scenarioId: string, stepId: string) {
  const raw = await readFile(path.resolve("content/scenarios", `${scenarioId}.json`), "utf8");
  const step = parseScenario(JSON.parse(raw)).steps.find((candidate) => candidate.id === stepId);
  assert.ok(step?.validation, `${scenarioId}/${stepId}`);
  return { ...step, validation: step.validation };
}

function promptEvent(prompt: string, activeFile: string | null): TrainingEvent {
  return {
    id: "event-1",
    source: "github-copilot-vscode-simulator",
    type: "copilot.prompt.submitted",
    timestamp: "2026-10-21T00:00:00.000Z",
    sessionId: "session-1",
    payload: { prompt, activeFile },
  };
}

for (const [scenarioId, stepId, ownWording] of [
  ["copilot-basics.guided", "use-file-context", "Erkläre mir bitte calculator.py kurz."],
  ["developer-workflow-basics.guided", "step_6", "Schreibe eine Plus-Rechnung für zwei Werte."],
] as const) {
  test(`#599: ${scenarioId}/${stepId} accepts own wording and explains a short or contextless prompt`, async () => {
    const step = await authoredStep(scenarioId, stepId);
    const validate = (prompt: string, activeFile: string | null) =>
      registry.validate(step.validation, { event: promptEvent(prompt, activeFile) });

    assert.equal((await validate(ownWording, "calculator.py")).outcome, "pass");

    const short = await validate("Hilfe", "calculator.py");
    assert.equal(stepFailureMessage(step, short), step.onFailure?.fieldMessages?.["prompt"]);
    const contextless = await validate(ownWording, null);
    assert.equal(
      stepFailureMessage(step, contextless),
      step.onFailure?.fieldMessages?.["activeFile"],
    );
  });
}

test("#599: the research classification names the source types, not a fixed recommendation verb", async () => {
  const step = await authoredStep("research-workflow.guided", "classify");
  assert.equal(step.expectedEvent, "copilot.prompt.submitted");
  const validate = (prompt: string) =>
    registry.validate(step.validation, { query: async () => prompt });

  // "Ich rate dazu" and "Anbieter" used to miss the lists for recommendation and manufacturer.
  assert.equal(
    (
      await validate(
        "Die Doku des Anbieters ist die Primärquelle, der offizielle Blog ist aktueller, der Community-Beitrag ist alt. Ich rate dazu, die Zahl zu korrigieren.",
      )
    ).outcome,
    "pass",
  );

  const missingType = await validate(
    "Die Herstellerdokumentation ist verlässlich und der Blog aktuell, deshalb würde ich der Zahl dort folgen und sie korrigieren.",
  );
  assert.equal(missingType.outcome, "near-miss");
  assert.equal(reportsNearMiss(step, missingType), true);
  assert.equal(stepFailureMessage(step, missingType), step.onFailure?.message);

  const listOnly = await validate("Hersteller, Blog, Community.");
  assert.equal(listOnly.outcome, "near-miss");
});
