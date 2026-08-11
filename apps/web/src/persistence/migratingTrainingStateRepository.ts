import { TrainingStateConflictError } from "@ai-train-lab/training-engine";
import type {
  StoredTrainingSession,
  TrainingSession,
  TrainingStateKey,
  TrainingStateRecord,
  TrainingStateRepository,
  TrainingStateWriteOptions,
} from "@ai-train-lab/training-engine";

const LOCAL_MIGRATION_REVISION = 0;

function migrationRecord<T>(
  record: TrainingStateRecord<T>,
  key: TrainingStateKey = record.key,
): TrainingStateRecord<T> {
  return {
    ...record,
    key,
    revision: LOCAL_MIGRATION_REVISION,
  };
}

function remoteWriteOptions(options: TrainingStateWriteOptions): TrainingStateWriteOptions {
  return {
    ...options,
    expectedRevision:
      options.expectedRevision === LOCAL_MIGRATION_REVISION ? null : options.expectedRevision,
  };
}

function previousPersonalKey(key: TrainingStateKey): TrainingStateKey | null {
  if (key.subject.tenantId !== `personal:${key.subject.userId}`) return null;
  return {
    ...key,
    subject: {
      userId: key.subject.userId,
      tenantId: null,
    },
  };
}

function rebindPersonalSession(
  record: TrainingStateRecord<StoredTrainingSession>,
  key: TrainingStateKey,
): TrainingStateRecord<StoredTrainingSession> | null {
  const subject = record.value.subject;
  if (typeof subject !== "object" || subject === null || Array.isArray(subject)) return null;
  if (Reflect.get(subject, "userId") !== key.subject.userId) return null;
  if (Reflect.get(subject, "tenantId") !== null) return null;

  return migrationRecord(
    {
      ...record,
      value: {
        ...record.value,
        subject: key.subject,
      },
    },
    key,
  );
}

/**
 * One-way compatibility bridge from owned browser state to the authoritative
 * remote repository.
 *
 * Local data is considered only after the remote repository successfully
 * reports that no server record exists. A failed initial remote read is never
 * masked by browser state. If the migration write itself is temporarily
 * unavailable, the owned local candidate is retained with revision 0 so a
 * later write can retry the create. Real remote records start at revision 1.
 *
 * The pre-server `tenantId=null` key may be rebound only into the deterministic
 * personal tenant of the same user. It is never adopted into a named tenant.
 */
export class MigratingTrainingStateRepository implements TrainingStateRepository {
  private readonly remote: TrainingStateRepository;
  private readonly localMigrationSource: TrainingStateRepository;

  constructor(remote: TrainingStateRepository, localMigrationSource: TrainingStateRepository) {
    this.remote = remote;
    this.localMigrationSource = localMigrationSource;
  }

  async loadSession(
    key: TrainingStateKey,
  ): Promise<TrainingStateRecord<StoredTrainingSession> | null> {
    const remoteRecord = await this.remote.loadSession(key);
    if (remoteRecord) return remoteRecord;

    const currentLocalRecord = await this.localMigrationSource.loadSession(key);
    if (currentLocalRecord) return migrationRecord(currentLocalRecord, key);

    const legacyKey = previousPersonalKey(key);
    if (!legacyKey) return null;
    const legacyRecord = await this.localMigrationSource.loadSession(legacyKey);
    return legacyRecord ? rebindPersonalSession(legacyRecord, key) : null;
  }

  saveSession(
    key: TrainingStateKey,
    session: TrainingSession,
    options: TrainingStateWriteOptions,
  ): Promise<TrainingStateRecord<StoredTrainingSession>> {
    return this.remote.saveSession(key, session, remoteWriteOptions(options));
  }

  async loadRuntimeSnapshot(
    key: TrainingStateKey,
    runtimeId: string,
  ): Promise<TrainingStateRecord<unknown> | null> {
    const remoteRecord = await this.remote.loadRuntimeSnapshot(key, runtimeId);
    if (remoteRecord) return remoteRecord;

    let localRecord = await this.localMigrationSource.loadRuntimeSnapshot(key, runtimeId);
    if (!localRecord) {
      const legacyKey = previousPersonalKey(key);
      if (legacyKey) {
        const legacyRecord = await this.localMigrationSource.loadRuntimeSnapshot(
          legacyKey,
          runtimeId,
        );
        if (legacyRecord) localRecord = migrationRecord(legacyRecord, key);
      }
    }
    if (!localRecord) return null;

    try {
      return await this.remote.saveRuntimeSnapshot(key, runtimeId, localRecord.value, {
        expectedRevision: null,
      });
    } catch (error) {
      if (error instanceof TrainingStateConflictError) {
        return (
          (await this.remote.loadRuntimeSnapshot(key, runtimeId)) ??
          migrationRecord(localRecord, key)
        );
      }
      return migrationRecord(localRecord, key);
    }
  }

  saveRuntimeSnapshot(
    key: TrainingStateKey,
    runtimeId: string,
    snapshot: unknown,
    options: TrainingStateWriteOptions,
  ): Promise<TrainingStateRecord<unknown>> {
    return this.remote.saveRuntimeSnapshot(key, runtimeId, snapshot, remoteWriteOptions(options));
  }

  async deleteRuntimeSnapshot(key: TrainingStateKey, runtimeId: string): Promise<void> {
    await this.remote.deleteRuntimeSnapshot(key, runtimeId);
    await this.localMigrationSource.deleteRuntimeSnapshot(key, runtimeId);

    const legacyKey = previousPersonalKey(key);
    if (legacyKey) await this.localMigrationSource.deleteRuntimeSnapshot(legacyKey, runtimeId);
  }
}
