import assert from "node:assert/strict";
import test from "node:test";
import {
  initialCompletionSavePending,
  settleCompletionSave,
  startCompletionSave,
} from "../src/completion/completionSavePending.ts";

test("a completion save marks the retry as pending while it runs", () => {
  const started = startCompletionSave(initialCompletionSavePending, true);
  assert.equal(started.pending, true);
  assert.equal(settleCompletionSave(started, started.latestRun).pending, false);
});

test("a save of an unfinished session is not pending and clears a stuck state", () => {
  // Genau der Haenger: ein abgebrochener Abschluss-Versuch wertet seinen Ausgang nicht mehr aus.
  const stuck = startCompletionSave(initialCompletionSavePending, true);
  assert.equal(stuck.pending, true);

  const next = startCompletionSave(stuck, false);
  assert.equal(next.pending, false, "der naechste Lauf raeumt den haengengebliebenen Zustand auf");
});

test("an older attempt must not clear the pending state of a newer one", () => {
  const older = startCompletionSave(initialCompletionSavePending, true);
  const newer = startCompletionSave(older, true);

  const afterOlderSettles = settleCompletionSave(newer, older.latestRun);
  assert.equal(
    afterOlderSettles.pending,
    true,
    "der laufende Versuch bleibt pending, sonst kehrt die Doppelklick-Rennbedingung zurueck",
  );
  assert.equal(afterOlderSettles, newer, "ein fremder Lauf aendert den Zustand gar nicht");

  assert.equal(settleCompletionSave(newer, newer.latestRun).pending, false);
});

test("an older attempt that settles after a newer one started stays without effect", () => {
  const first = startCompletionSave(initialCompletionSavePending, true);
  const settledFirst = settleCompletionSave(first, first.latestRun);
  const second = startCompletionSave(settledFirst, true);

  assert.equal(settleCompletionSave(second, first.latestRun), second);
  assert.equal(second.pending, true);
});

test("run numbers keep increasing so a later attempt can always be told apart", () => {
  let state = initialCompletionSavePending;
  const seen = new Set<number>();
  for (let index = 0; index < 5; index += 1) {
    state = startCompletionSave(state, index % 2 === 0);
    seen.add(state.latestRun);
  }
  assert.equal(seen.size, 5);
  assert.equal(state.latestRun, 5);
});
