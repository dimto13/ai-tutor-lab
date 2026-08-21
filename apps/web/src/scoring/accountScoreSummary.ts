import type { ScenarioScoreService } from "@ai-train-lab/training-engine";
import { createApplicationScenarioScoreService } from "./applicationScenarioScoreService";
import {
  ACCOUNT_SCORE_EVENT_WINDOW,
  summarizeAccountScoreWindow,
  type AccountScoreSummary,
} from "./accountScoreSummaryPolicy";

export { ACCOUNT_SCORE_EVENT_WINDOW, type AccountScoreSummary } from "./accountScoreSummaryPolicy";

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
  return summarizeAccountScoreWindow(events);
}
