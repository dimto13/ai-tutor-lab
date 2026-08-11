import type { TrainingStateRepository } from "@ai-train-lab/training-engine";
import { createBrowserTrainingStateRepository } from "@/state/localStorageTrainingStateRepository";

export type ApplicationTrainingStateMode = "local" | "remote";

function configuredMode(): ApplicationTrainingStateMode {
  const configured = import.meta.env["VITE_TRAINING_STATE_MODE"]?.trim().toLowerCase();
  if (configured === "local" || configured === "remote") return configured;
  if (configured) throw new Error(`Unsupported VITE_TRAINING_STATE_MODE: ${configured}`);

  const authMode = import.meta.env["VITE_AUTH_MODE"]?.trim().toLowerCase();
  if (authMode === "local") return "local";
  if (authMode === "cognito") return "remote";
  return import.meta.env.PROD ? "remote" : "local";
}

function createLazyRemoteRepository(): TrainingStateRepository {
  let repositoryPromise: Promise<TrainingStateRepository> | null = null;

  function getRepository(): Promise<TrainingStateRepository> {
    repositoryPromise ??= import("./adapters/amplifyTrainingStateRepository").then(
      ({ createAmplifyTrainingStateRepository }) => createAmplifyTrainingStateRepository(),
    );
    return repositoryPromise;
  }

  return {
    async loadSession(key) {
      return (await getRepository()).loadSession(key);
    },
    async saveSession(key, session, options) {
      return (await getRepository()).saveSession(key, session, options);
    },
    async loadRuntimeSnapshot(key, runtimeId) {
      return (await getRepository()).loadRuntimeSnapshot(key, runtimeId);
    },
    async saveRuntimeSnapshot(key, runtimeId, snapshot, options) {
      return (await getRepository()).saveRuntimeSnapshot(key, runtimeId, snapshot, options);
    },
    async deleteRuntimeSnapshot(key, runtimeId) {
      await (await getRepository()).deleteRuntimeSnapshot(key, runtimeId);
    },
  };
}

/**
 * Composition root for durable training state. Local development/E2E use the
 * browser adapter; authenticated production uses the remote Amplify adapter.
 */
export function createApplicationTrainingStateRepository(): TrainingStateRepository {
  return configuredMode() === "local"
    ? createBrowserTrainingStateRepository()
    : createLazyRemoteRepository();
}
