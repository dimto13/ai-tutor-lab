import type { SelfAssessedAiLevel, TrainingMode } from "@ai-train-lab/training-engine";

export interface UserPreferencesSubject {
  userId: string;
  tenantId: string | null;
}

export interface UserPreferencesValue {
  language: string | null;
  preferredTrainingMode: TrainingMode | null;
  weeklyGoalMinutes: number | null;
  weeklyReminderEnabled: boolean | null;
  accessibility: unknown | null;
  selfAssessedAiLevel: SelfAssessedAiLevel | null;
}

export interface UserPreferencesRecord extends UserPreferencesValue {
  subject: UserPreferencesSubject;
  revision: number;
  updatedAt: number;
}

export class UserPreferencesConflictError extends Error {
  readonly expectedRevision: number | null;
  readonly actualRevision: number | null;

  constructor(expectedRevision: number | null, actualRevision: number | null) {
    super(
      `User preferences revision conflict: expected ${expectedRevision ?? "none"}, actual ${actualRevision ?? "none"}`,
    );
    this.name = "UserPreferencesConflictError";
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export interface UserPreferencesRepository {
  load(subject: UserPreferencesSubject): Promise<UserPreferencesRecord | null>;
  save(
    subject: UserPreferencesSubject,
    value: UserPreferencesValue,
    expectedRevision: number | null,
  ): Promise<UserPreferencesRecord>;
}
