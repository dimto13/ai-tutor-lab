import { generateClient } from "aws-amplify/data";
import { isSelfAssessedAiLevel, type TrainingMode } from "@ai-train-lab/training-engine";
import type { Schema } from "../../../../../amplify/data/resource";
import {
  UserPreferencesConflictError,
  type UserPreferencesRecord,
  type UserPreferencesRepository,
  type UserPreferencesSubject,
  type UserPreferencesValue,
} from "../../profile/userPreferencesRepository.ts";

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

function trainingMode(value: unknown): TrainingMode | null {
  return value === "explore" || value === "guided" || value === "challenge" ? value : null;
}

function preferencesRecord(
  subject: UserPreferencesSubject,
  data: {
    userId?: unknown;
    tenantId?: unknown;
    language?: unknown;
    preferredTrainingMode?: unknown;
    weeklyGoalMinutes?: unknown;
    weeklyReminderEnabled?: unknown;
    accessibility?: unknown;
    selfAssessedAiLevel?: unknown;
    revision?: unknown;
    updatedAt?: unknown;
  },
): UserPreferencesRecord {
  if (data.userId !== subject.userId) {
    throw new Error("Persisted user preferences belong to a different authenticated user");
  }
  if (typeof data.tenantId !== "string" || data.tenantId.length === 0) {
    throw new Error("Persisted user preferences have no authoritative tenant");
  }
  if (subject.tenantId !== null && data.tenantId !== subject.tenantId) {
    throw new Error("Persisted user preferences belong to a different tenant");
  }
  if (typeof data.revision !== "number" || !Number.isInteger(data.revision) || data.revision < 1) {
    throw new Error("Persisted user preferences have an invalid revision");
  }
  if (typeof data.updatedAt !== "number" || !Number.isFinite(data.updatedAt)) {
    throw new Error("Persisted user preferences have an invalid update timestamp");
  }
  if (
    data.selfAssessedAiLevel !== null &&
    data.selfAssessedAiLevel !== undefined &&
    !isSelfAssessedAiLevel(data.selfAssessedAiLevel)
  ) {
    throw new Error("Persisted user preferences have an invalid self-assessed AI level");
  }
  if (
    data.weeklyReminderEnabled !== null &&
    data.weeklyReminderEnabled !== undefined &&
    typeof data.weeklyReminderEnabled !== "boolean"
  ) {
    throw new Error("Persisted user preferences have an invalid weekly reminder consent");
  }

  return {
    subject: { userId: subject.userId, tenantId: data.tenantId },
    language: typeof data.language === "string" ? data.language : null,
    preferredTrainingMode: trainingMode(data.preferredTrainingMode),
    weeklyGoalMinutes: typeof data.weeklyGoalMinutes === "number" ? data.weeklyGoalMinutes : null,
    weeklyReminderEnabled:
      typeof data.weeklyReminderEnabled === "boolean" ? data.weeklyReminderEnabled : null,
    accessibility: data.accessibility ?? null,
    selfAssessedAiLevel: data.selfAssessedAiLevel ?? null,
    revision: data.revision,
    updatedAt: data.updatedAt,
  };
}

export function createAmplifyUserPreferencesRepository(): UserPreferencesRepository {
  const client = generateClient<Schema>();
  type SaveArgs = Parameters<typeof client.mutations.saveUserPreferences>[0];
  type AccessibilityArg = Exclude<SaveArgs["accessibility"], undefined>;

  const repository: UserPreferencesRepository = {
    async load(subject) {
      const result = await client.queries.loadUserPreferences();
      if (result.errors?.length) throw new Error(errorText(result.errors));
      if (!result.data) return null;
      return preferencesRecord(subject, result.data);
    },

    async save(subject, value: UserPreferencesValue, expectedRevision) {
      const args: SaveArgs = {
        language: value.language,
        preferredTrainingMode: value.preferredTrainingMode,
        weeklyGoalMinutes: value.weeklyGoalMinutes,
        weeklyReminderEnabled: value.weeklyReminderEnabled,
        accessibility: value.accessibility as AccessibilityArg,
        selfAssessedAiLevel: value.selfAssessedAiLevel,
        ...(expectedRevision === null ? {} : { expectedRevision }),
      };
      const result = await client.mutations.saveUserPreferences(args);
      if (result.errors?.length) {
        if (isRevisionConflict(result.errors)) {
          const current = await repository.load(subject);
          throw new UserPreferencesConflictError(expectedRevision, current?.revision ?? null);
        }
        throw new Error(errorText(result.errors));
      }
      if (!result.data) throw new Error("Amplify Data returned no user preferences after save");
      return preferencesRecord(subject, result.data);
    },
  };

  return repository;
}
