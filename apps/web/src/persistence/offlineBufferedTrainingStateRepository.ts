import { TrainingStateConflictError } from "@ai-train-lab/training-engine";
import type {
  StoredTrainingSession,
  TrainingSession,
  TrainingStateKey,
  TrainingStateRecord,
  TrainingStateRepository,
  TrainingStateWriteOptions,
} from "@ai-train-lab/training-engine";
import type { LocalStorageTrainingStateRepository } from "@/state/localStorageTrainingStateRepository";
import {
  TRAINING_SYNC_METADATA_VERSION,
  type TrainingStateSyncMetadata,
  type TrainingStateSyncMetadataStore,
} from "./trainingStateSyncMetadata";

function cleanMetadata(remoteRevision: number | null): TrainingStateSyncMetadata {
  return {
    version: TRAINING_SYNC_METADATA_VERSION,
    remoteKnown: true,
    remoteRevision,
    dirty: false,
    pendingDelete: false,
    lastSyncedAt: Date.now(),
  };
}

function dirtyMetadata(
  current: TrainingStateSyncMetadata | null,
  pendingDelete = false,
): TrainingStateSyncMetadata {
  return {
    version: TRAINING_SYNC_METADATA_VERSION,
    remoteKnown: current?.remoteKnown ?? false,
    remoteRevision: current?.remoteRevision ?? null,
    dirty: true,
    pendingDelete,
    lastSyncedAt: current?.lastSyncedAt ?? null,
  };
}

function observedRevision<T>(record: TrainingStateRecord<T> | null): number | null {
  return record?.revision ?? null;
}

function mayApplyOfflineWrite(
  metadata: TrainingStateSyncMetadata,
  remoteRecord: TrainingStateRecord<unknown> | null,
): boolean {
  const revision = observedRevision(remoteRecord);
  if (metadata.remoteKnown) return metadata.remoteRevision === revision;
  return remoteRecord === null || remoteRecord.revision === 0;
}

/**
 * Remote-authoritative repository with a local write buffer.
 *
 * Every mutation is written to the local repository first. Remote sync uses a
 * separately tracked base revision; a changed remote revision wins
 * deterministically instead of being overwritten by stale offline state.
 */
export class OfflineBufferedTrainingStateRepository implements TrainingStateRepository {
  private readonly remote: TrainingStateRepository;
  private readonly local: LocalStorageTrainingStateRepository;
  private readonly metadata: TrainingStateSyncMetadataStore;

  constructor(
    remote: TrainingStateRepository,
    local: LocalStorageTrainingStateRepository,
    metadata: TrainingStateSyncMetadataStore,
  ) {
    this.remote = remote;
    this.local = local;
    this.metadata = metadata;
  }

  async loadSession(
    key: TrainingStateKey,
  ): Promise<TrainingStateRecord<StoredTrainingSession> | null> {
    const localRecord = await this.local.loadSession(key);
    const sync = this.metadata.loadSession(key);

    let remoteRecord: TrainingStateRecord<StoredTrainingSession> | null;
    try {
      remoteRecord = await this.remote.loadSession(key);
    } catch (error) {
      if (localRecord) return localRecord;
      throw error;
    }

    if (localRecord && sync?.dirty) {
      return this.synchronizeSession(key, localRecord, sync, remoteRecord);
    }

    if (!remoteRecord) {
      this.metadata.saveSession(key, cleanMetadata(null));
      return null;
    }

    if (
      localRecord &&
      sync?.remoteKnown &&
      !sync.dirty &&
      sync.remoteRevision === remoteRecord.revision
    ) {
      return localRecord;
    }

    if (remoteRecord.revision === 0) {
      const cached = await this.local.replaceSession(
        key,
        remoteRecord.value,
        remoteRecord.updatedAt,
      );
      const migrationSync: TrainingStateSyncMetadata = {
        ...cleanMetadata(0),
        dirty: true,
        lastSyncedAt: null,
      };
      this.metadata.saveSession(key, migrationSync);
      return this.synchronizeSession(key, cached, migrationSync, remoteRecord);
    }

    const cached = await this.local.replaceSession(key, remoteRecord.value, remoteRecord.updatedAt);
    this.metadata.saveSession(key, cleanMetadata(remoteRecord.revision));
    return cached;
  }

  async saveSession(
    key: TrainingStateKey,
    session: TrainingSession,
    options: TrainingStateWriteOptions,
  ): Promise<TrainingStateRecord<StoredTrainingSession>> {
    const localRecord = await this.local.saveSession(key, session, options);
    const sync = dirtyMetadata(this.metadata.loadSession(key));
    this.metadata.saveSession(key, sync);

    try {
      const remoteRecord = await this.remote.loadSession(key);
      return await this.synchronizeSession(key, localRecord, sync, remoteRecord);
    } catch (error) {
      if (error instanceof TrainingStateConflictError) throw error;
      return localRecord;
    }
  }

  async loadRuntimeSnapshot(
    key: TrainingStateKey,
    runtimeId: string,
  ): Promise<TrainingStateRecord<unknown> | null> {
    const localRecord = await this.local.loadRuntimeSnapshot(key, runtimeId);
    const sync = this.metadata.loadRuntime(key, runtimeId);

    let remoteRecord: TrainingStateRecord<unknown> | null;
    try {
      remoteRecord = await this.remote.loadRuntimeSnapshot(key, runtimeId);
    } catch (error) {
      if (sync?.pendingDelete) return null;
      if (localRecord) return localRecord;
      throw error;
    }

    if (sync?.pendingDelete) {
      return this.synchronizeRuntimeDelete(key, runtimeId, sync, remoteRecord);
    }

    if (localRecord && sync?.dirty) {
      return this.synchronizeRuntimeSnapshot(key, runtimeId, localRecord, sync, remoteRecord);
    }

    if (!remoteRecord) {
      this.metadata.saveRuntime(key, runtimeId, cleanMetadata(null));
      return null;
    }

    if (
      localRecord &&
      sync?.remoteKnown &&
      !sync.dirty &&
      sync.remoteRevision === remoteRecord.revision
    ) {
      return localRecord;
    }

    if (remoteRecord.revision === 0) {
      const cached = await this.local.replaceRuntimeSnapshot(
        key,
        runtimeId,
        remoteRecord.value,
        remoteRecord.updatedAt,
      );
      const migrationSync: TrainingStateSyncMetadata = {
        ...cleanMetadata(0),
        dirty: true,
        lastSyncedAt: null,
      };
      this.metadata.saveRuntime(key, runtimeId, migrationSync);
      return this.synchronizeRuntimeSnapshot(key, runtimeId, cached, migrationSync, remoteRecord);
    }

    const cached = await this.local.replaceRuntimeSnapshot(
      key,
      runtimeId,
      remoteRecord.value,
      remoteRecord.updatedAt,
    );
    this.metadata.saveRuntime(key, runtimeId, cleanMetadata(remoteRecord.revision));
    return cached;
  }

  async saveRuntimeSnapshot(
    key: TrainingStateKey,
    runtimeId: string,
    snapshot: unknown,
    options: TrainingStateWriteOptions,
  ): Promise<TrainingStateRecord<unknown>> {
    const localRecord = await this.local.saveRuntimeSnapshot(key, runtimeId, snapshot, options);
    const sync = dirtyMetadata(this.metadata.loadRuntime(key, runtimeId));
    this.metadata.saveRuntime(key, runtimeId, sync);

    try {
      const remoteRecord = await this.remote.loadRuntimeSnapshot(key, runtimeId);
      return await this.synchronizeRuntimeSnapshot(key, runtimeId, localRecord, sync, remoteRecord);
    } catch (error) {
      if (error instanceof TrainingStateConflictError) throw error;
      return localRecord;
    }
  }

  async deleteRuntimeSnapshot(key: TrainingStateKey, runtimeId: string): Promise<void> {
    const sync = dirtyMetadata(this.metadata.loadRuntime(key, runtimeId), true);
    await this.local.deleteRuntimeSnapshot(key, runtimeId);
    this.metadata.saveRuntime(key, runtimeId, sync);

    try {
      const remoteRecord = await this.remote.loadRuntimeSnapshot(key, runtimeId);
      await this.synchronizeRuntimeDelete(key, runtimeId, sync, remoteRecord);
    } catch (error) {
      if (error instanceof TrainingStateConflictError) throw error;
      // Keep the local tombstone. A later load retries synchronization.
    }
  }

  private async synchronizeSession(
    key: TrainingStateKey,
    localRecord: TrainingStateRecord<StoredTrainingSession>,
    sync: TrainingStateSyncMetadata,
    remoteRecord: TrainingStateRecord<StoredTrainingSession> | null,
  ): Promise<TrainingStateRecord<StoredTrainingSession>> {
    if (!mayApplyOfflineWrite(sync, remoteRecord)) {
      if (!remoteRecord) return localRecord;
      const cached = await this.local.replaceSession(
        key,
        remoteRecord.value,
        remoteRecord.updatedAt,
      );
      this.metadata.saveSession(key, cleanMetadata(remoteRecord.revision));
      return cached;
    }

    try {
      const saved = await this.remote.saveSession(key, localRecord.value as TrainingSession, {
        expectedRevision: observedRevision(remoteRecord),
      });
      this.metadata.saveSession(key, cleanMetadata(saved.revision));
      return localRecord;
    } catch (error) {
      if (!(error instanceof TrainingStateConflictError)) return localRecord;
      const latest = await this.remote.loadSession(key);
      if (!latest) return localRecord;
      const cached = await this.local.replaceSession(key, latest.value, latest.updatedAt);
      this.metadata.saveSession(key, cleanMetadata(latest.revision));
      return cached;
    }
  }

  private async synchronizeRuntimeSnapshot(
    key: TrainingStateKey,
    runtimeId: string,
    localRecord: TrainingStateRecord<unknown>,
    sync: TrainingStateSyncMetadata,
    remoteRecord: TrainingStateRecord<unknown> | null,
  ): Promise<TrainingStateRecord<unknown>> {
    if (!mayApplyOfflineWrite(sync, remoteRecord)) {
      if (!remoteRecord) return localRecord;
      const cached = await this.local.replaceRuntimeSnapshot(
        key,
        runtimeId,
        remoteRecord.value,
        remoteRecord.updatedAt,
      );
      this.metadata.saveRuntime(key, runtimeId, cleanMetadata(remoteRecord.revision));
      return cached;
    }

    try {
      const saved = await this.remote.saveRuntimeSnapshot(key, runtimeId, localRecord.value, {
        expectedRevision: observedRevision(remoteRecord),
      });
      this.metadata.saveRuntime(key, runtimeId, cleanMetadata(saved.revision));
      return localRecord;
    } catch (error) {
      if (!(error instanceof TrainingStateConflictError)) return localRecord;
      const latest = await this.remote.loadRuntimeSnapshot(key, runtimeId);
      if (!latest) return localRecord;
      const cached = await this.local.replaceRuntimeSnapshot(
        key,
        runtimeId,
        latest.value,
        latest.updatedAt,
      );
      this.metadata.saveRuntime(key, runtimeId, cleanMetadata(latest.revision));
      return cached;
    }
  }

  private async synchronizeRuntimeDelete(
    key: TrainingStateKey,
    runtimeId: string,
    sync: TrainingStateSyncMetadata,
    remoteRecord: TrainingStateRecord<unknown> | null,
  ): Promise<null> {
    if (!mayApplyOfflineWrite(sync, remoteRecord)) {
      if (remoteRecord) {
        await this.local.replaceRuntimeSnapshot(
          key,
          runtimeId,
          remoteRecord.value,
          remoteRecord.updatedAt,
        );
        this.metadata.saveRuntime(key, runtimeId, cleanMetadata(remoteRecord.revision));
      } else {
        this.metadata.deleteRuntime(key, runtimeId);
      }
      return null;
    }

    await this.remote.deleteRuntimeSnapshot(key, runtimeId);
    this.metadata.deleteRuntime(key, runtimeId);
    return null;
  }
}
