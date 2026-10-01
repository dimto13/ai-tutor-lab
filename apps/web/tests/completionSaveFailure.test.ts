import assert from "node:assert/strict";
import test from "node:test";
import { TrainingStateUnavailableError } from "@ai-train-lab/training-engine";
import { completionSaveFailureMessage } from "../src/completion/completionSaveFailure.ts";

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
