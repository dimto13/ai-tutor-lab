import type { UserProfileRepository } from "./userProfileRepository";
import { createLocalUserProfileRepository } from "./adapters/localUserProfileRepository";

function configuredMode(): "local" | "remote" {
  const authMode = import.meta.env["VITE_AUTH_MODE"]?.trim().toLowerCase();
  if (authMode === "local") return "local";
  if (authMode === "cognito") return "remote";
  return import.meta.env.PROD ? "remote" : "local";
}

function createLazyRemoteRepository(): UserProfileRepository {
  let repositoryPromise: Promise<UserProfileRepository> | null = null;

  function getRepository(): Promise<UserProfileRepository> {
    repositoryPromise ??= import("./adapters/amplifyUserProfileRepository").then(
      ({ createAmplifyUserProfileRepository }) => createAmplifyUserProfileRepository(),
    );
    return repositoryPromise;
  }

  return {
    async load(subject) {
      return (await getRepository()).load(subject);
    },
    async save(subject, input, expectedRevision) {
      return (await getRepository()).save(subject, input, expectedRevision);
    },
  };
}

export function createApplicationUserProfileRepository(): UserProfileRepository {
  return configuredMode() === "local"
    ? createLocalUserProfileRepository()
    : createLazyRemoteRepository();
}
