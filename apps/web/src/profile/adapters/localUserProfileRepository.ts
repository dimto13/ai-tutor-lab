import type {
  UserProfileRecord,
  UserProfileRepository,
  UserProfileSubject,
} from "../userProfileRepository";
import { UserProfileConflictError } from "../userProfileRepository";

const STORAGE_PREFIX = "ai-train-lab.user-profile.v1";

export interface UserProfileStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function userProfileStorageKey(subject: UserProfileSubject): string {
  return `${STORAGE_PREFIX}:${subject.tenantId ?? "personal"}:${subject.userId}`;
}

export class LocalUserProfileRepository implements UserProfileRepository {
  constructor(private readonly storage: UserProfileStorageLike) {}

  private read(subject: UserProfileSubject): UserProfileRecord | null {
    const raw = this.storage.getItem(userProfileStorageKey(subject));
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as UserProfileRecord;
      if (parsed.subject?.userId !== subject.userId) return null;
      if ((parsed.subject?.tenantId ?? null) !== (subject.tenantId ?? null)) return null;
      if (!Number.isInteger(parsed.revision) || parsed.revision < 1) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async load(subject: UserProfileSubject): Promise<UserProfileRecord | null> {
    return this.read(subject);
  }

  async save(
    subject: UserProfileSubject,
    input: { displayName: string | null },
    expectedRevision: number | null,
  ): Promise<UserProfileRecord> {
    const current = this.read(subject);
    const actualRevision = current?.revision ?? null;
    if (actualRevision !== expectedRevision) {
      throw new UserProfileConflictError(expectedRevision, actualRevision);
    }

    const record: UserProfileRecord = {
      subject,
      displayName: input.displayName,
      email: current?.email ?? null,
      revision: (actualRevision ?? 0) + 1,
    };
    this.storage.setItem(userProfileStorageKey(subject), JSON.stringify(record));
    return record;
  }
}

export function createLocalUserProfileRepository(): UserProfileRepository {
  if (typeof window === "undefined") {
    return {
      async load() {
        return null;
      },
      async save() {
        throw new Error("Local user profile persistence is only available in the browser");
      },
    };
  }
  return new LocalUserProfileRepository(window.localStorage);
}
