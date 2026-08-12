import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../../../../amplify/data/resource";
import {
  UserProfileConflictError,
  type UserProfileRecord,
  type UserProfileRepository,
  type UserProfileSubject,
} from "../userProfileRepository";

function errorText(errors: unknown): string {
  if (!Array.isArray(errors)) return "Unknown Amplify Data error";
  return errors
    .map((error) => {
      if (typeof error !== "object" || error === null) return String(error);
      const message = Reflect.get(error, "message");
      const errorType = Reflect.get(error, "errorType");
      return [errorType, message].filter((value) => typeof value === "string").join(": ");
    })
    .filter(Boolean)
    .join("; ");
}

function isRevisionConflict(errors: unknown): boolean {
  return /ConditionalCheckFailed|conditional request failed/i.test(errorText(errors));
}

function profileRecord(
  subject: UserProfileSubject,
  data: {
    userId?: unknown;
    tenantId?: unknown;
    displayName?: unknown;
    email?: unknown;
    revision?: unknown;
  },
): UserProfileRecord {
  if (data.userId !== subject.userId) {
    throw new Error("Persisted user profile belongs to a different authenticated user");
  }
  if (typeof data.tenantId !== "string" || data.tenantId.length === 0) {
    throw new Error("Persisted user profile has no authoritative tenant");
  }
  if (subject.tenantId !== null && data.tenantId !== subject.tenantId) {
    throw new Error("Persisted user profile belongs to a different tenant");
  }
  if (typeof data.revision !== "number" || !Number.isInteger(data.revision) || data.revision < 1) {
    throw new Error("Persisted user profile has an invalid revision");
  }

  return {
    subject: { userId: subject.userId, tenantId: data.tenantId },
    displayName: typeof data.displayName === "string" ? data.displayName : null,
    email: typeof data.email === "string" ? data.email : null,
    revision: data.revision,
  };
}

export function createAmplifyUserProfileRepository(): UserProfileRepository {
  const client = generateClient<Schema>();
  type SaveArgs = Parameters<typeof client.mutations.saveUserProfile>[0];

  const repository: UserProfileRepository = {
    async load(subject) {
      const result = await client.queries.loadUserProfile();
      if (result.errors?.length) throw new Error(errorText(result.errors));
      if (!result.data) return null;
      return profileRecord(subject, result.data);
    },

    async save(subject, input, expectedRevision) {
      const args: SaveArgs = {
        displayName: input.displayName,
        ...(expectedRevision === null ? {} : { expectedRevision }),
      };
      const result = await client.mutations.saveUserProfile(args);
      if (result.errors?.length) {
        if (isRevisionConflict(result.errors)) {
          const current = await repository.load(subject);
          throw new UserProfileConflictError(expectedRevision, current?.revision ?? null);
        }
        throw new Error(errorText(result.errors));
      }
      if (!result.data) throw new Error("Amplify Data returned no user profile after save");
      return profileRecord(subject, result.data);
    },
  };

  return repository;
}
