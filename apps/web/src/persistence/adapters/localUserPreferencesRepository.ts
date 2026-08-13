import { isSelfAssessedAiLevel } from "@ai-train-lab/training-engine";
import type {
  UserPreferencesRecord,
  UserPreferencesRepository,
  UserPreferencesSubject,
  UserPreferencesValue,
} from "../../profile/userPreferencesRepository.ts";
import { UserPreferencesConflictError } from "../../profile/userPreferencesRepository.ts";

const STORAGE_PREFIX = "ai-train-lab.user-preferences.v1";

export interface UserPreferencesStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function userPreferencesStorageKey(subject: UserPreferencesSubject): string {
  return `${STORAGE_PREFIX}:${subject.tenantId ?? "personal"}:${subject.userId}`;
}

function validStoredRecord(
  subject: UserPreferencesSubject,
  value: unknown,
): UserPreferencesRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const parsed = value as Partial<UserPreferencesRecord>;
  if (parsed.subject?.userId !== subject.userId) return null;
  if ((parsed.subject?.tenantId ?? null) !== (subject.tenantId ?? null)) return null;
  if (!Number.isInteger(parsed.revision) || (parsed.revision ?? 0) < 1) return null;
  if (typeof parsed.updatedAt !== "number" || !Number.isFinite(parsed.updatedAt)) return null;
  if (
    parsed.selfAssessedAiLevel !== null &&
    parsed.selfAssessedAiLevel !== undefined &&
    !isSelfAssessedAiLevel(parsed.selfAssessedAiLevel)
  ) {
    return null;
  }
  return parsed as UserPreferencesRecord;
}

export class LocalUserPreferencesRepository implements UserPreferencesRepository {
  private readonly storage: UserPreferencesStorageLike;

  constructor(storage: UserPreferencesStorageLike) {
    this.storage = storage;
  }

  private read(subject: UserPreferencesSubject): UserPreferencesRecord | null {
    const raw = this.storage.getItem(userPreferencesStorageKey(subject));
    if (!raw) return null;

    try {
      return validStoredRecord(subject, JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async load(subject: UserPreferencesSubject): Promise<UserPreferencesRecord | null> {
    return this.read(subject);
  }

  async save(
    subject: UserPreferencesSubject,
    value: UserPreferencesValue,
    expectedRevision: number | null,
  ): Promise<UserPreferencesRecord> {
    const current = this.read(subject);
    const actualRevision = current?.revision ?? null;
    if (actualRevision !== expectedRevision) {
      throw new UserPreferencesConflictError(expectedRevision, actualRevision);
    }

    const record: UserPreferencesRecord = {
      subject,
      ...value,
      revision: (actualRevision ?? 0) + 1,
      updatedAt: Date.now(),
    };
    this.storage.setItem(userPreferencesStorageKey(subject), JSON.stringify(record));
    return record;
  }
}

export function createLocalUserPreferencesRepository(): UserPreferencesRepository {
  if (typeof window === "undefined") {
    return {
      async load() {
        return null;
      },
      async save() {
        throw new Error("Local user preference persistence is only available in the browser");
      },
    };
  }
  return new LocalUserPreferencesRepository(window.localStorage);
}
