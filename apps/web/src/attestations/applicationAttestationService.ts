import type { AttestationService } from "@ai-train-lab/training-engine";

function configuredMode(): "local" | "remote" {
  const configured = import.meta.env["VITE_TRAINING_STATE_MODE"]?.trim().toLowerCase();
  if (configured === "local" || configured === "remote") return configured;
  if (configured) throw new Error(`Unsupported VITE_TRAINING_STATE_MODE: ${configured}`);

  const authMode = import.meta.env["VITE_AUTH_MODE"]?.trim().toLowerCase();
  if (authMode === "local") return "local";
  if (authMode === "cognito") return "remote";
  return import.meta.env.PROD ? "remote" : "local";
}

function createLazyRemoteService(): AttestationService {
  let servicePromise: Promise<AttestationService> | null = null;

  function getService(): Promise<AttestationService> {
    servicePromise ??= import("./adapters/amplifyAttestationService").then(
      ({ createAmplifyAttestationService }) => createAmplifyAttestationService(),
    );
    return servicePromise;
  }

  return {
    async issueChallenge(request) {
      return (await getService()).issueChallenge(request);
    },
    async listAttestations(limit) {
      return (await getService()).listAttestations(limit);
    },
    async exportAttestation(attestationId, format) {
      return (await getService()).exportAttestation(attestationId, format);
    },
  };
}

/** Local browser state cannot issue or export authoritative competency attestations. */
export function createApplicationAttestationService(): AttestationService | null {
  return configuredMode() === "remote" ? createLazyRemoteService() : null;
}
