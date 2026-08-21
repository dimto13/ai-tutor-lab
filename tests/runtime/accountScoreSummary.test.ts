import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_SCORE_EVENT_WINDOW,
  summarizeAccountScoreWindow,
} from "../../apps/web/src/scoring/accountScoreSummaryPolicy.ts";

test("a partial ledger window is reported as an exact personal score", () => {
  assert.deepEqual(summarizeAccountScoreWindow([{ points: 1.25 }, { points: 2.5 }]), {
    kind: "exact",
    points: 3.75,
    eventCount: 2,
  });
});

test("a full ledger window is only reported as a lower bound", () => {
  const events = Array.from({ length: ACCOUNT_SCORE_EVENT_WINDOW }, () => ({ points: 1 }));

  assert.deepEqual(summarizeAccountScoreWindow(events), {
    kind: "lower-bound",
    points: ACCOUNT_SCORE_EVENT_WINDOW,
    eventCount: ACCOUNT_SCORE_EVENT_WINDOW,
  });
});
