import assert from "node:assert/strict";
import test from "node:test";
import { TrainingStateUnavailableError } from "@ai-train-lab/training-engine";
import {
  completionSaveFailureMessage,
  trainingStateSaveDiagnostic,
} from "../src/completion/completionSaveFailure.ts";

test("a temporarily unavailable server explains the local buffer and the retry", () => {
  const message = completionSaveFailureMessage(
    new TrainingStateUnavailableError(new TypeError("Failed to fetch")),
  );
  assert.match(message, /noch nicht auf dem Server gespeichert/);
  assert.match(message, /Gerät erhalten/);
  assert.match(message, /erneut versuchen/);
  assert.doesNotMatch(message, /Failed to fetch/, "no transport internals for learners");
});

test("a revision conflict tells the learner to load the current state", () => {
  const message = completionSaveFailureMessage(
    new Error("DynamoDB:ConditionalCheckFailedException"),
  );
  assert.match(message, /noch nicht gespeichert/);
  assert.match(message, /zwischenzeitlich geändert/);
});

test("an authorization failure never reads as a temporary hiccup", () => {
  const message = completionSaveFailureMessage(new Error("Unauthorized"));
  assert.match(message, /nicht verfügbar/);
  assert.doesNotMatch(message, /Verbindung/);
});

test("an unknown cause still states that nothing was lost", () => {
  const message = completionSaveFailureMessage({ weird: true });
  assert.match(message, /noch nicht gespeichert/);
  assert.match(message, /bisherigen Daten bleiben erhalten/);
});

test("English messages are available for the localized surface", () => {
  const message = completionSaveFailureMessage(new TrainingStateUnavailableError(), "en");
  assert.match(message, /not saved on the server yet/);
});

const context = {
  scenarioId: "copilot-agent-basics",
  mode: "guided",
  finishedAt: 1_760_000_000_000,
  occurredAt: Date.UTC(2026, 9, 12, 8, 30),
};

test("the diagnostic keeps the AppSync errorType and message the learner text hides", () => {
  const diagnostic = trainingStateSaveDiagnostic(
    {
      errors: [
        {
          errorType: "DynamoDB:ConditionalCheckFailedException",
          message: "The conditional request failed",
        },
        { errorType: "Unauthorized", message: "Not Authorized to access saveTrainingState" },
      ],
    },
    context,
  );
  assert.match(diagnostic, /Operation: saveTrainingState \(Abschluss\)/);
  assert.match(diagnostic, /Training: copilot-agent-basics · guided/);
  assert.match(diagnostic, /Zeitpunkt: 2026-10-12T08:30:00\.000Z/);
  assert.match(
    diagnostic,
    /DynamoDB:ConditionalCheckFailedException: The conditional request failed/,
  );
  assert.match(diagnostic, / \| Unauthorized: Not Authorized to access saveTrainingState/);
});

test("the diagnostic follows the buffer's originalError down to the transport cause", () => {
  const diagnostic = trainingStateSaveDiagnostic(
    new TrainingStateUnavailableError(new TypeError("Failed to fetch")),
    context,
  );
  assert.match(diagnostic, /Fehlerklasse: unavailable/);
  assert.match(
    diagnostic,
    /Ursache: TrainingStateUnavailableError: Training state repository is temporarily unavailable ← TypeError: Failed to fetch/,
  );
});

test("the diagnostic follows Error.cause and classifies by the outermost error", () => {
  const diagnostic = trainingStateSaveDiagnostic(
    new Error("saveTrainingState failed", {
      cause: new Error("DynamoDB:ConditionalCheckFailedException"),
    }),
    { ...context, finishedAt: null },
  );
  assert.match(diagnostic, /\(Zwischenstand\)/);
  assert.match(
    diagnostic,
    /Ursache: saveTrainingState failed ← DynamoDB:ConditionalCheckFailedException/,
  );
});

test("the diagnostic names an unknown cause instead of printing an empty line", () => {
  const diagnostic = trainingStateSaveDiagnostic({ weird: true }, context);
  assert.match(diagnostic, /Fehlerklasse: unexpected/);
  assert.match(diagnostic, /Ursache: unbekannt/);
});

test("the diagnostic stops at a cycle and stays short enough to paste", () => {
  const looping = new Error("loop");
  Object.defineProperty(looping, "cause", { value: looping });
  assert.match(trainingStateSaveDiagnostic(looping, context), /Ursache: loop$/);

  const long = trainingStateSaveDiagnostic(new Error("x".repeat(5000)), context);
  assert.ok(long.length <= 1202, `diagnostic has ${long.length} characters`);
  assert.ok(long.endsWith(" …"));
});

test("the diagnostic keeps a repeated text from a different level and stops at a revisited error", () => {
  const inner = new Error("Network error");
  const middle = new Error("Retry exhausted", { cause: inner });
  const outer = new Error("Network error", { cause: middle });
  assert.match(
    trainingStateSaveDiagnostic(outer, context),
    /Ursache: Network error ← Retry exhausted ← Network error$/,
  );

  const first = new Error("first");
  const second = new Error("second", { cause: first });
  Object.defineProperty(first, "cause", { value: second });
  assert.match(trainingStateSaveDiagnostic(first, context), /Ursache: first ← second$/);
});

test("an empty GraphQL errors array falls back to the error message", () => {
  const diagnostic = trainingStateSaveDiagnostic(
    { errors: [], message: "Request failed with status code 502" },
    context,
  );
  assert.match(diagnostic, /Ursache: Request failed with status code 502$/);
});
