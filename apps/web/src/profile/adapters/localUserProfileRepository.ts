import type {
  UserProfileRecord,
  UserProfileRepository,
  UserProfileSubject,
} from "../userProfileRepository";
import { UserProfileConflictError } from "../userProfileRepository";

const STORAGE_PREFIX = "ai-train-lab.user-profile.v1";

function storageKey(subject: UserProfileSubject): string {
  return `${STORAGE_PREFIX}:${subject.tenantId ?? "personal"}:${subject.userId}`;
}

function read(subject: UserProfileSubject): UserProfileRecord | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey(subject));
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

export function createLocalUserProfileRepository(): UserProfileRepository {
  return {
    async load(subject) {
      return read(subject);
    },

    async save(subject, input, expectedRevision) {
      const current = read(subject);
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
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey(subject), JSON.stringify(record));
      }
      return record;
    },
  };
}
