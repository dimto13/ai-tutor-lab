import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeeklyContinuity,
  formatLearningTime,
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
    learningMs: 12 * 60_000,
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
  const retry = run({ finishedAt: NOW, learningMs: 99 * 60_000 });

  const activities = recentLearningActivities([original, retry]);

  assert.equal(activities.length, 1);
  assert.equal(activities[0]?.learningMs, retry.learningMs);
});

test("preserves historical weekly minutes without activity metadata", () => {
  const legacy: WeeklyContinuityRun = {
    finishedAt: NOW - 60_000,
    learningMs: 12 * 60_000,
  };

  assert.deepEqual(recentLearningActivities([legacy]), []);
  assert.equal(buildWeeklyContinuity([legacy], null, NOW).currentWeekMinutes, 12);
});

test("does not apply scoring mode multipliers to learning time", () => {
  const runs = [
    run({ sessionId: "explore", mode: "explore", learningMs: 10 * 60_000 }),
    run({ sessionId: "guided", mode: "guided", learningMs: 10 * 60_000 }),
    run({
      sessionId: "challenge",
      mode: "challenge",
      learningMs: 10 * 60_000,
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
    run({ learningMs: -1, sessionId: "negative-duration" }),
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

test("a run without measured learning time is listed but counts no minutes (#582)", () => {
  const unmeasured = run({ sessionId: "before-582", learningMs: null });
  const measured = run({ sessionId: "after-582", learningMs: 9 * 60_000, finishedAt: NOW });

  assert.deepEqual(
    recentLearningActivities([unmeasured, measured]).map((activity) => activity.sessionId),
    ["after-582", "before-582"],
  );
  assert.equal(buildWeeklyContinuity([unmeasured, measured], 30, NOW).currentWeekMinutes, 9);
});

test("every view formats learning time the same way: whole minutes, at least one", () => {
  assert.equal(formatLearningTime(2.5 * 60_000), "3 Min.");
  assert.equal(formatLearningTime(13 * 60_000), "13 Min.");
  assert.equal(formatLearningTime(10_000), "1 Min.");
  assert.equal(formatLearningTime(null), null);
  assert.equal(formatLearningTime(Number.NaN), null);
});
