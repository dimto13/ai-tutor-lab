import type { ScenarioScoreService } from "@ai-train-lab/training-engine";
import { createApplicationScenarioScoreService } from "./applicationScenarioScoreService";

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

/**
 * Loads the authenticated learner's personal score without pretending that the current bounded
 * ledger read is a complete lifetime total. A full 100-event window is therefore exposed only as
 * a lower bound until the scoring port offers pagination or a server-side personal total.
 */
export async function loadAccountScoreSummary(
  service: ScenarioScoreService | null = createApplicationScenarioScoreService(),
): Promise<AccountScoreSummary> {
  if (!service) return { kind: "unavailable", reason: "local-mode" };

  const events = await service.listScoreEvents(ACCOUNT_SCORE_EVENT_WINDOW);
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
