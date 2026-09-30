import assert from "node:assert/strict";
import test from "node:test";
import { scoreRetryFollowsCompletionSave } from "../src/completion/completionSaveRecovery.ts";

const failure = "Dein Abschluss ist noch nicht auf dem Server gespeichert.";

test("a completion save that recovers re-requests a failed score", () => {
  assert.equal(
    scoreRetryFollowsCompletionSave({
      previousCompletionSaveFailure: failure,
      completionSaveFailure: null,
      scoreStatus: "error",
    }),
    true,
  );
});

test("a completion that never failed does not trigger a score retry", () => {
  assert.equal(
    scoreRetryFollowsCompletionSave({
      previousCompletionSaveFailure: null,
      completionSaveFailure: null,
      scoreStatus: "error",
    }),
    false,
  );
});

test("a still failing completion does not trigger a score retry", () => {
  assert.equal(
    scoreRetryFollowsCompletionSave({
      previousCompletionSaveFailure: failure,
      completionSaveFailure: failure,
      scoreStatus: "error",
    }),
    false,
  );
});

test("a score that is not in error stays untouched", () => {
  for (const scoreStatus of ["idle", "unavailable", "pending", "ready"] as const) {
    assert.equal(
      scoreRetryFollowsCompletionSave({
        previousCompletionSaveFailure: failure,
        completionSaveFailure: null,
        scoreStatus,
      }),
      false,
      `${scoreStatus} must not start an award retry`,
    );
  }
});

test("a score that fails again is not retried endlessly", () => {
  // Nach der Flanke ist der vorherige Zustand "kein Fehler". Ein erneut fehlgeschlagener
  // Wertungsversuch darf daraus keine zweite Anforderung ableiten.
  assert.equal(
    scoreRetryFollowsCompletionSave({
      previousCompletionSaveFailure: null,
      completionSaveFailure: null,
      scoreStatus: "error",
    }),
    false,
  );
});
