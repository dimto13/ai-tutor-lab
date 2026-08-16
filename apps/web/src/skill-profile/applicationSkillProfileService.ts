import type { SkillProfileService } from "@ai-train-lab/training-engine";

function configuredMode(): "local" | "remote" {
  const configured = import.meta.env["VITE_TRAINING_STATE_MODE"]?.trim().toLowerCase();
  if (configured === "local" || configured === "remote") return configured;
  if (configured) throw new Error(`Unsupported VITE_TRAINING_STATE_MODE: ${configured}`);

  const authMode = import.meta.env["VITE_AUTH_MODE"]?.trim().toLowerCase();
  if (authMode === "local") return "local";
  if (authMode === "cognito") return "remote";
  return import.meta.env.PROD ? "remote" : "local";
}

function createLazyRemoteService(): SkillProfileService {
  let servicePromise: Promise<SkillProfileService> | null = null;

  function getService(): Promise<SkillProfileService> {
    servicePromise ??= import("./adapters/amplifySkillProfileService").then(
      ({ createAmplifySkillProfileService }) => createAmplifySkillProfileService(),
    );
    return servicePromise;
  }

  return {
    async listSkillProfiles() {
      return (await getService()).listSkillProfiles();
    },
  };
}

/**
 * Competence is authoritative only in remote/authenticated mode. Local browser state may show
 * training progress, but it must never synthesize a SkillProfile.
 */
export function createApplicationSkillProfileService(): SkillProfileService | null {
  return configuredMode() === "remote" ? createLazyRemoteService() : null;
}
