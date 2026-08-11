import {
  TRAINING_STATE_SCHEMA_VERSION,
  TrainingStateConflictError,
  sameTrainingStateKey,
  sameTrainingSubject,
} from "@ai-train-lab/training-engine";
import type {
  StoredTrainingSession,
  TrainingSession,
  TrainingStateKey,
  TrainingStateRecord,
  TrainingStateRepository,
  TrainingStateWriteOptions,
} from "@ai-train-lab/training-engine";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function subjectKey(key: TrainingStateKey): string {
  const tenantKey =
    key.subject.tenantId === null
      ? "tenant:none"
      : `tenant:value:${encodeURIComponent(key.subject.tenantId)}`;
  return `${tenantKey}:user:${encodeURIComponent(key.subject.userId)}`;
}

export function trainingSessionStorageKey(key: TrainingStateKey): string {
  return `ai-training-lab:${subjectKey(key)}:${encodeURIComponent(key.scenarioId)}:mode:${key.mode}:state:v4`;
}

export function runtimeSnapshotStorageKey(key: TrainingStateKey, runtimeId: string): string {
  return `ai-training-lab:${subjectKey(key)}:${encodeURIComponent(key.scenarioId)}:mode:${key.mode}:runtime:${encodeURIComponent(runtimeId)}:v3`;
}

function legacyTrainingSessionStorageKey(key: TrainingStateKey): string {
  return `ai-training-lab:${subjectKey(key)}:${key.scenarioId}:v3`;
}

function legacyRuntimeSnapshotStorageKey(key: TrainingStateKey, runtimeId: string): string {
  return `ai-training-lab:${subjectKey(key)}:${key.scenarioId}:runtime:${runtimeId}:v2`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEnvelope<T>(raw: string, key: TrainingStateKey): TrainingStateRecord<T> | null {
  const parsed: unknown = JSON.parse(raw);
  if (!isObject(parsed)) return null;
  if (parsed["schemaVersion"] !== TRAINING_STATE_SCHEMA_VERSION) return null;
  if (!Number.isInteger(parsed["revision"]) || (parsed["revision"] as number) < 1) return null;
  if (typeof parsed["updatedAt"] !== "number" || !Number.isFinite(parsed["updatedAt"])) return null;
  const storedKey = parsed["key"];
  if (!isObject(storedKey)) return null;
  const storedSubject = storedKey["subject"];
  if (!isObject(storedSubject)) return null;
  const candidateKey: TrainingStateKey = {
    scenarioId: typeof storedKey["scenarioId"] === "string" ? storedKey["scenarioId"] : "",
    mode:
      storedKey["mode"] === "explore" ||
      storedKey["mode"] === "guided" ||
      storedKey["mode"] === "challenge"
        ? storedKey["mode"]
        : "guided",
    subject: {
      userId: typeof storedSubject["userId"] === "string" ? storedSubject["userId"] : "",
      tenantId:
        storedSubject["tenantId"] === null || typeof storedSubject["tenantId"] === "string"
          ? storedSubject["tenantId"]
          : null,
    },
  };
  if (!sameTrainingStateKey(candidateKey, key)) return null;
  return {
    schemaVersion: TRAINING_STATE_SCHEMA_VERSION,
    key,
    revision: parsed["revision"] as number,
    updatedAt: parsed["updatedAt"],
    value: parsed["value"] as T,
  };
}

function legacySessionUpdatedAt(value: StoredTrainingSession): number {
  if (typeof value.finishedAt === "number") return value.finishedAt;
  if (typeof value.startedAt === "number") return value.startedAt;
  return 0;
}

function assertSessionMatchesKey(key: TrainingStateKey, session: TrainingSession): void {
  if (
    session.scenarioId !== key.scenarioId ||
    session.mode !== key.mode ||
    !sameTrainingSubject(session.subject, key.subject)
  ) {
    throw new Error("Training session does not match persistence key");
  }
}

function nextRecord<T>(
  key: TrainingStateKey,
  value: T,
  actualRevision: number | null,
  options: TrainingStateWriteOptions,
): TrainingStateRecord<T> {
  if (options.expectedRevision !== actualRevision) {
    throw new TrainingStateConflictError(options.expectedRevision, actualRevision);
  }
  return {
    schemaVersion: TRAINING_STATE_SCHEMA_VERSION,
    key,
    revision: (actualRevision ?? 0) + 1,
    updatedAt: options.updatedAt ?? Date.now(),
    value,
  };
}

export class LocalStorageTrainingStateRepository implements TrainingStateRepository {
  constructor(private readonly storage: StorageLike) {}

  async loadSession(key: TrainingStateKey): Promise<TrainingStateRecord<StoredTrainingSession> | null> {
    const currentRaw = this.storage.getItem(trainingSessionStorageKey(key));
    if (currentRaw) {
      try {
        return parseEnvelope<StoredTrainingSession>(currentRaw, key);
      } catch {
        return null;
      }
    }

    const legacyRaw = this.storage.getItem(legacyTrainingSessionStorageKey(key));
    if (!legacyRaw) return null;
    try {
      const value = JSON.parse(legacyRaw) as StoredTrainingSession;
      return {
        schemaVersion: TRAINING_STATE_SCHEMA_VERSION,
        key,
        revision: 0,
        updatedAt: legacySessionUpdatedAt(value),
        value,
      };
    } catch {
      return null;
    }
  }

  async saveSession(
    key: TrainingStateKey,
    session: TrainingSession,
    options: TrainingStateWriteOptions,
  ): Promise<TrainingStateRecord<StoredTrainingSession>> {
    assertSessionMatchesKey(key, session);
    const current = await this.loadSession(key);
    const record = nextRecord<StoredTrainingSession>(key, session, current?.revision ?? null, options);
    this.storage.setItem(trainingSessionStorageKey(key), JSON.stringify(record));
    this.storage.removeItem(legacyTrainingSessionStorageKey(key));
    return record;
  }

  async loadRuntimeSnapshot(
    key: TrainingStateKey,
    runtimeId: string,
  ): Promise<TrainingStateRecord<unknown> | null> {
    const currentRaw = this.storage.getItem(runtimeSnapshotStorageKey(key, runtimeId));
    if (currentRaw) {
      try {
        return parseEnvelope<unknown>(currentRaw, key);
      } catch {
        return null;
      }
    }

    const legacyRaw = this.storage.getItem(legacyRuntimeSnapshotStorageKey(key, runtimeId));
    if (!legacyRaw) return null;
    try {
      return {
        schemaVersion: TRAINING_STATE_SCHEMA_VERSION,
        key,
        revision: 0,
        updatedAt: 0,
        value: JSON.parse(legacyRaw) as unknown,
      };
    } catch {
      return null;
    }
  }

  async saveRuntimeSnapshot(
    key: TrainingStateKey,
    runtimeId: string,
    snapshot: unknown,
    options: TrainingStateWriteOptions,
  ): Promise<TrainingStateRecord<unknown>> {
    if (!runtimeId.trim()) throw new Error("Runtime id must not be blank");
    const current = await this.loadRuntimeSnapshot(key, runtimeId);
    const record = nextRecord(key, snapshot, current?.revision ?? null, options);
    this.storage.setItem(runtimeSnapshotStorageKey(key, runtimeId), JSON.stringify(record));
    this.storage.removeItem(legacyRuntimeSnapshotStorageKey(key, runtimeId));
    return record;
  }

  async deleteRuntimeSnapshot(key: TrainingStateKey, runtimeId: string): Promise<void> {
    this.storage.removeItem(runtimeSnapshotStorageKey(key, runtimeId));
    this.storage.removeItem(legacyRuntimeSnapshotStorageKey(key, runtimeId));
  }
}

export function createBrowserTrainingStateRepository(): TrainingStateRepository {
  if (typeof window === "undefined") {
    throw new Error("Browser training state repository requires window.localStorage");
  }
  return new LocalStorageTrainingStateRepository(window.localStorage);
}
