import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeeklyContinuity,
  recentLearningActivities,
  type WeeklyContinuityRun,
} from "../src/continuity/weeklyContinuity.ts";

const NOW = Date.UTC(2026, 8, 18, 12, 0, 0);

function run(overrides: Partial<WeeklyContinuityRun> = {}): WeeklyContinuityRun {
  return {
    scenarioId: "vscode-basics",
    mode: "guided",
    sessionId: "session-1",
    finishedAt: NOW - 60_000,
    durationMs: 12 * 60_000,
    ...overrides,
  };
}

test("projects persisted scenario, mode and measured duration", () => {
  const activities = recentLearningActivities([run()]);

  assert.deepEqual(activities, [run()]);
  assert.equal(buildWeeklyContinuity([run()], null, NOW).currentWeekMinutes, 12);
});

test("deduplicates retry evidence by session id and keeps the latest state", () => {
  const original = run();
  const retry = run({ finishedAt: NOW, durationMs: 99 * 60_000 });

  const activities = recentLearningActivities([original, retry]);

  assert.equal(activities.length, 1);
  assert.equal(activities[0]?.durationMs, retry.durationMs);
});

test("preserves historical weekly minutes without activity metadata", () => {
  const legacy: WeeklyContinuityRun = {
    finishedAt: NOW - 60_000,
    durationMs: 12 * 60_000,
  };

  assert.deepEqual(recentLearningActivities([legacy]), []);
  assert.equal(buildWeeklyContinuity([legacy], null, NOW).currentWeekMinutes, 12);
});

test("does not apply scoring mode multipliers to learning time", () => {
  const runs = [
    run({ sessionId: "explore", mode: "explore", durationMs: 10 * 60_000 }),
    run({ sessionId: "guided", mode: "guided", durationMs: 10 * 60_000 }),
    run({
      sessionId: "challenge",
      mode: "challenge",
      durationMs: 10 * 60_000,
    }),
  ];

  assert.equal(buildWeeklyContinuity(runs, null, NOW).currentWeekMinutes, 30);
});

test("fails closed for incomplete activity metadata and invalid timing", () => {
  const incomplete = [
    run({ sessionId: "" }),
    run({ scenarioId: "", sessionId: "missing-scenario" }),
    run({ mode: "", sessionId: "missing-mode" }),
  ];
  const invalidTiming = [
    run({ durationMs: -1, sessionId: "negative-duration" }),
    run({ finishedAt: Number.NaN, sessionId: "invalid-finished-at" }),
  ];

  assert.deepEqual(recentLearningActivities([...incomplete, ...invalidTiming]), []);
  assert.equal(buildWeeklyContinuity(invalidTiming, null, NOW).currentWeekMinutes, 0);
});

test("sorts newest activities first and respects the requested limit", () => {
  const activities = recentLearningActivities(
    [
      run({ sessionId: "older", finishedAt: NOW - 120_000 }),
      run({ sessionId: "newest", finishedAt: NOW }),
      run({ sessionId: "middle", finishedAt: NOW - 60_000 }),
    ],
    2,
  );

  assert.deepEqual(
    activities.map((activity) => activity.sessionId),
    ["newest", "middle"],
  );
});
