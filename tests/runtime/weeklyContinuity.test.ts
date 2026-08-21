import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWeeklyContinuity,
  startOfUtcWeek,
} from "../../apps/web/src/continuity/weeklyContinuity.ts";

const MONDAY = Date.UTC(2026, 7, 17, 12);

test("weekly continuity returns exactly eight calendar weeks and aggregates run duration", () => {
  const currentWeek = startOfUtcWeek(MONDAY);
  const previousWeek = currentWeek - 7 * 24 * 60 * 60 * 1000;
  const summary = buildWeeklyContinuity(
    [
      { finishedAt: currentWeek + 60_000, durationMs: 20 * 60_000 },
      { finishedAt: currentWeek + 120_000, durationMs: 25 * 60_000 },
      { finishedAt: previousWeek + 60_000, durationMs: 30 * 60_000 },
    ],
    60,
    MONDAY,
  );

  assert.equal(summary.weeks.length, 8);
  assert.equal(summary.weeks.at(-1)?.minutes, 45);
  assert.equal(summary.weeks.at(-2)?.minutes, 30);
  assert.equal(summary.currentWeekMinutes, 45);
  assert.equal(summary.goalProgressPercent, 75);
});

test("weekly continuity ignores old or malformed runs and caps goal display at 100 percent", () => {
  const currentWeek = startOfUtcWeek(MONDAY);
  const oldWeek = currentWeek - 8 * 7 * 24 * 60 * 60 * 1000;
  const summary = buildWeeklyContinuity(
    [
      { finishedAt: currentWeek + 60_000, durationMs: 90 * 60_000 },
      { finishedAt: oldWeek, durationMs: 500 * 60_000 },
      { finishedAt: Number.NaN, durationMs: 60_000 },
      { finishedAt: currentWeek + 120_000, durationMs: -1 },
    ],
    60,
    MONDAY,
  );

  assert.equal(summary.currentWeekMinutes, 90);
  assert.equal(summary.goalProgressPercent, 100);
});

test("weekly continuity has no loss or streak state when no goal is configured", () => {
  const summary = buildWeeklyContinuity([], null, MONDAY);

  assert.equal(summary.currentWeekMinutes, 0);
  assert.equal(summary.goalMinutes, null);
  assert.equal(summary.goalProgressPercent, null);
  assert.ok(summary.weeks.every((week) => week.minutes === 0));
  assert.equal("streak" in summary, false);
  assert.equal("penalty" in summary, false);
});
