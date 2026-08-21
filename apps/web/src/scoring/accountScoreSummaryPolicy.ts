export const ACCOUNT_SCORE_EVENT_WINDOW = 100;

export type AccountScoreSummary =
  | {
      kind: "unavailable";
      reason: "local-mode";
    }
  | {
      kind: "exact";
      points: number;
      eventCount: number;
    }
  | {
      kind: "lower-bound";
      points: number;
      eventCount: number;
    };

function roundPoints(points: number): number {
  return Math.round(points * 100) / 100;
}

export function summarizeAccountScoreWindow(
  events: readonly { points: number }[],
): Exclude<AccountScoreSummary, { kind: "unavailable" }> {
  const points = roundPoints(events.reduce((total, event) => total + event.points, 0));

  if (events.length >= ACCOUNT_SCORE_EVENT_WINDOW) {
    return {
      kind: "lower-bound",
      points,
      eventCount: events.length,
    };
  }

  return {
    kind: "exact",
    points,
    eventCount: events.length,
  };
}
