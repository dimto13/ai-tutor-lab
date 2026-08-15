import type { ScenarioScoreService } from "@ai-train-lab/training-engine";

function configuredMode(): "local" | "remote" {
  const configured = import.meta.env["VITE_TRAINING_STATE_MODE"]?.trim().toLowerCase();
  if (configured === "local" || configured === "remote") return configured;
  if (configured) throw new Error(`Unsupported VITE_TRAINING_STATE_MODE: ${configured}`);

  const authMode = import.meta.env["VITE_AUTH_MODE"]?.trim().toLowerCase();
  if (authMode === "local") return "local";
  if (authMode === "cognito") return "remote";
  return import.meta.env.PROD ? "remote" : "local";
}

function createLazyRemoteService(): ScenarioScoreService {
  let servicePromise: Promise<ScenarioScoreService> | null = null;

  function getService(): Promise<ScenarioScoreService> {
    servicePromise ??= import("./adapters/amplifyScenarioScoreService").then(
      ({ createAmplifyScenarioScoreService }) => createAmplifyScenarioScoreService(),
    );
    return servicePromise;
  }

  return {
    async awardScenario(request) {
      return (await getService()).awardScenario(request);
    },
    async listScoreEvents(limit) {
      return (await getService()).listScoreEvents(limit);
    },
  };
}

/**
 * Scoring is intentionally unavailable in local-only/E2E mode: local browser state is not an
 * authoritative source for awarded points. Production/authenticated mode uses the remote adapter.
 */
export function createApplicationScenarioScoreService(): ScenarioScoreService | null {
  return configuredMode() === "remote" ? createLazyRemoteService() : null;
}
