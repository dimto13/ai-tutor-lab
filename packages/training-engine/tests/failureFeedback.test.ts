import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_STEP_FAILURE_MESSAGE,
  isAuthoredStepFailure,
  latestStepFailureMessage,
  stepFailureMessage,
  validationFailureFields,
} from "../src/failureFeedback.ts";
import { createDefaultValidatorRegistry } from "../src/validation.ts";
import type { Attempt } from "../src/stateMachine.ts";
import type { TrainingEvent, TrainingStep, Validation } from "../src/types.ts";

const pullRequestValidation: Validation = {
  kind: "event",
  type: "platform.pull_request.created",
  match: { headBranch: "feature/readme-guide", title: "README um Einstieg ergänzen" },
  minWords: { description: 3 },
};

const step: Pick<TrainingStep, "onFailure"> = {
  onFailure: {
    message: "Der Pull Request erfüllt den Schritt noch nicht.",
    fieldMessages: {
      title: "Trage genau den vorgegebenen Titel ein.",
      description: "Beschreibe in einem ganzen Satz Zweck und Prüfung.",
    },
  },
};

function created(payload: Record<string, unknown>): TrainingEvent {
  return {
    id: "event-1",
    source: "test-runtime",
    type: "platform.pull_request.created",
    timestamp: "2026-10-20T00:00:00.000Z",
    sessionId: "session-1",
    payload: {
      headBranch: "feature/readme-guide",
      title: "README um Einstieg ergänzen",
      ...payload,
    },
  };
}

test("#591: the beta tester's own description finishes the step instead of a keyword list", async () => {
  const registry = createDefaultValidatorRegistry();
  for (const description of [
    "Prüfung der Änderung.",
    "Link überprüft, passt.",
    "Habe alles gecheckt und keine Passwörter gefunden.",
  ]) {
    const result = await registry.validate(pullRequestValidation, {
      event: created({ description }),
    });
    assert.equal(result.outcome, "pass", description);
  }
});

test("a description that is too short names the field and gets the step's own message", async () => {
  const registry = createDefaultValidatorRegistry();
  for (const description of ["", "Prüfung folgt.", "ok", "   -  ?  "]) {
    const result = await registry.validate(pullRequestValidation, {
      event: created({ description }),
    });
    assert.equal(result.outcome, "near-miss", description);
    assert.equal(result.details?.["field"], "description");
    assert.equal(
      stepFailureMessage(step, result),
      "Beschreibe in einem ganzen Satz Zweck und Prüfung.",
    );
  }
});

test("a wrong title reports the title before the description", async () => {
  const result = await createDefaultValidatorRegistry().validate(pullRequestValidation, {
    event: created({ title: "", description: "" }),
  });
  assert.equal(stepFailureMessage(step, result), "Trage genau den vorgegebenen Titel ein.");
});

test("failure messages fall back from field to step to engine to default", () => {
  const nearMiss = { outcome: "near-miss" as const, message: "Engine", details: { field: "x" } };
  assert.equal(
    stepFailureMessage(step, nearMiss),
    "Der Pull Request erfüllt den Schritt noch nicht.",
  );
  assert.equal(stepFailureMessage({}, nearMiss), "Engine");
  assert.equal(stepFailureMessage({}, { outcome: "near-miss" }), DEFAULT_STEP_FAILURE_MESSAGE);
  // Inherited object keys are no authored field messages.
  assert.equal(
    stepFailureMessage(step, { outcome: "near-miss", details: { field: "constructor" } }),
    "Der Pull Request erfüllt den Schritt noch nicht.",
  );
});

test("the latest failure of an open step survives in the session, a completed step has none", () => {
  const attempts: Attempt[] = [
    { id: "a1", stepId: "create", outcome: "near-miss", timestamp: 1, message: "Erster Grund" },
    { id: "a2", stepId: "other", outcome: "near-miss", timestamp: 2, message: "Anderer Schritt" },
    { id: "a3", stepId: "create", outcome: "near-miss", timestamp: 3, message: "Zweiter Grund" },
  ];
  assert.equal(
    latestStepFailureMessage({ attempts, statuses: { create: "VALIDATION_FAILED" } }, "create"),
    "Zweiter Grund",
  );
  assert.equal(
    latestStepFailureMessage({ attempts, statuses: { create: "ACTIVE" } }, "create"),
    "Zweiter Grund",
  );
  assert.equal(
    latestStepFailureMessage({ attempts, statuses: { create: "COMPLETED" } }, "create"),
    null,
  );
  assert.equal(
    latestStepFailureMessage(
      {
        attempts: [...attempts, { id: "a4", stepId: "create", outcome: "pass", timestamp: 4 }],
        statuses: { create: "ACTIVE" },
      },
      "create",
    ),
    null,
  );
  assert.equal(latestStepFailureMessage({ attempts, statuses: {} }, "missing"), null);
});

test("failure fields cover every key a validation can report", () => {
  assert.deepEqual(validationFailureFields(pullRequestValidation), [
    "headBranch",
    "title",
    "description",
  ]);
  assert.deepEqual(
    validationFailureFields({
      kind: "all",
      of: [
        { kind: "state", selector: "platform.pullRequest.description", minWords: 3 },
        { kind: "not", of: { kind: "state", selector: "platform.issue.opened", equals: true } },
      ],
    }),
    ["platform.pullRequest.description", "state"],
  );
});

test("only the step's own messages count as authored failures", () => {
  assert.equal(isAuthoredStepFailure(step, "Trage genau den vorgegebenen Titel ein."), true);
  assert.equal(
    isAuthoredStepFailure(step, "Der Pull Request erfüllt den Schritt noch nicht."),
    true,
  );
  assert.equal(isAuthoredStepFailure(step, DEFAULT_STEP_FAILURE_MESSAGE), false);
  assert.equal(isAuthoredStepFailure({}, "Trage genau den vorgegebenen Titel ein."), false);
});
