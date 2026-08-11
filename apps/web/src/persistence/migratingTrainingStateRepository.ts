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

function migrationRecord<T>(record: TrainingStateRecord<T>): TrainingStateRecord<T> {
  return {
    ...record,
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

/**
 * One-way compatibility bridge from owned browser state to the authoritative
 * remote repository.
 *
 * Local data is considered only after the remote repository successfully
 * reports that no server record exists. A failed initial remote read is never
 * masked by browser state. If the migration write itself is temporarily
 * unavailable, the owned local candidate is retained with revision 0 so a
 * later write can retry the create. Real remote records start at revision 1.
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

    const localRecord = await this.localMigrationSource.loadSession(key);
    return localRecord ? migrationRecord(localRecord) : null;
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

    const localRecord = await this.localMigrationSource.loadRuntimeSnapshot(key, runtimeId);
    if (!localRecord) return null;

    try {
      return await this.remote.saveRuntimeSnapshot(key, runtimeId, localRecord.value, {
        expectedRevision: null,
      });
    } catch (error) {
      if (error instanceof TrainingStateConflictError) {
        return (
          (await this.remote.loadRuntimeSnapshot(key, runtimeId)) ?? migrationRecord(localRecord)
        );
      }
      return migrationRecord(localRecord);
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
  }
}
