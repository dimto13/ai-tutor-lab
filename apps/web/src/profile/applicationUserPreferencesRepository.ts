import type { UserPreferencesRepository } from "./userPreferencesRepository";
import { createLocalUserPreferencesRepository } from "@/persistence/adapters/localUserPreferencesRepository";

function configuredMode(): "local" | "remote" {
  const authMode = import.meta.env["VITE_AUTH_MODE"]?.trim().toLowerCase();
  if (authMode === "local") return "local";
  if (authMode === "cognito") return "remote";
  return import.meta.env.PROD ? "remote" : "local";
}

function createLazyRemoteRepository(): UserPreferencesRepository {
  let repositoryPromise: Promise<UserPreferencesRepository> | null = null;

  function getRepository(): Promise<UserPreferencesRepository> {
    repositoryPromise ??= import("@/persistence/adapters/amplifyUserPreferencesRepository").then(
      ({ createAmplifyUserPreferencesRepository }) => createAmplifyUserPreferencesRepository(),
    );
    return repositoryPromise;
  }

  return {
    async load(subject) {
      return (await getRepository()).load(subject);
    },
    async save(subject, value, expectedRevision) {
      return (await getRepository()).save(subject, value, expectedRevision);
    },
  };
}

export function createApplicationUserPreferencesRepository(): UserPreferencesRepository {
  return configuredMode() === "local"
    ? createLocalUserPreferencesRepository()
    : createLazyRemoteRepository();
}
