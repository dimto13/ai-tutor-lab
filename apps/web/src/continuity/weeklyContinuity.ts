export interface WeeklyContinuityRun {
  finishedAt: number;
  durationMs: number;
}

export interface WeeklyContinuityWeek {
  weekStart: number;
  minutes: number;
}

export interface WeeklyContinuitySummary {
  weeks: WeeklyContinuityWeek[];
  currentWeekMinutes: number;
  goalMinutes: number | null;
  goalProgressPercent: number | null;
}

const WEEK_COUNT = 8;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export function startOfUtcWeek(timestamp: number): number {
  const date = new Date(timestamp);
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysSinceMonday);
}

export function buildWeeklyContinuity(
  runs: readonly WeeklyContinuityRun[],
  goalMinutes: number | null,
  now: number = Date.now(),
): WeeklyContinuitySummary {
  const currentWeekStart = startOfUtcWeek(now);
  const firstWeekStart = currentWeekStart - (WEEK_COUNT - 1) * WEEK_MS;
  const totals = new Map<number, number>();

  for (const run of runs) {
    if (
      !Number.isFinite(run.finishedAt) ||
      !Number.isFinite(run.durationMs) ||
      run.durationMs < 0
    ) {
      continue;
    }
    const weekStart = startOfUtcWeek(run.finishedAt);
    if (weekStart < firstWeekStart || weekStart > currentWeekStart) continue;
    totals.set(weekStart, (totals.get(weekStart) ?? 0) + run.durationMs);
  }

  const weeks = Array.from({ length: WEEK_COUNT }, (_, index) => {
    const weekStart = firstWeekStart + index * WEEK_MS;
    return {
      weekStart,
      minutes: Math.round((totals.get(weekStart) ?? 0) / 60_000),
    };
  });
  const currentWeekMinutes = weeks.at(-1)?.minutes ?? 0;
  const validGoal = goalMinutes !== null && Number.isFinite(goalMinutes) && goalMinutes > 0;

  return {
    weeks,
    currentWeekMinutes,
    goalMinutes: validGoal ? goalMinutes : null,
    goalProgressPercent: validGoal
      ? Math.min(100, Math.round((currentWeekMinutes / goalMinutes) * 100))
      : null,
  };
}

export function formatWeekLabel(weekStart: number): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(weekStart));
}
