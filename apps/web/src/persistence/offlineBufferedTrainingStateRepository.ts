import {
  TRAINING_STATE_SCHEMA_VERSION,
  TrainingStateConflictError,
  TrainingStateUnavailableError,
} from "@ai-train-lab/training-engine";
import type {
  StoredTrainingSession,
  TrainingSession,
  TrainingStateKey,
  TrainingStateRecord,
  TrainingStateRepository,
  TrainingStateWriteOptions,
} from "@ai-train-lab/training-engine";
import {
  OFFLINE_TRAINING_STATE_SCHEMA_VERSION,
  type OfflineRuntimeEntry,
  type OfflineSessionEntry,
  type OfflineTrainingStateStore,
} from "./offlineTrainingStateStore.ts";
import type {
  PendingTrainingStateSynchronization,
  PendingTrainingStateSynchronizationResult,
} from "./pendingTrainingStateSynchronization.ts";

function virtualRevision(remoteRevision: number | null): number {
  return remoteRevision ?? 0;
}

function sessionRecord(entry: OfflineSessionEntry): TrainingStateRecord<StoredTrainingSession> {
  return {
    schemaVersion: TRAINING_STATE_SCHEMA_VERSION,
    key: entry.key,
    revision: virtualRevision(entry.remoteRevision),
    updatedAt: entry.updatedAt,
    value: entry.value,
  };
}

function runtimeRecord(entry: OfflineRuntimeEntry): TrainingStateRecord<unknown> | null {
  if (entry.deleted) return null;
  return {
    schemaVersion: TRAINING_STATE_SCHEMA_VERSION,
    key: entry.key,
    revision: virtualRevision(entry.remoteRevision),
    updatedAt: entry.updatedAt,
    value: entry.value,
  };
}

function cacheSession(
  store: OfflineTrainingStateStore,
  key: TrainingStateKey,
  record: TrainingStateRecord<StoredTrainingSession> | null,
): void {
  if (!record) {
    store.deleteSession(key);
    return;
  }
  store.saveSession({
    schemaVersion: OFFLINE_TRAINING_STATE_SCHEMA_VERSION,
    key,
    remoteRevision: record.revision,
    updatedAt: record.updatedAt,
    pending: false,
    value: record.value,
  });
}

function cacheRuntime(
  store: OfflineTrainingStateStore,
  key: TrainingStateKey,
  runtimeId: string,
  record: TrainingStateRecord<unknown> | null,
): void {
  if (!record) {
    store.deleteRuntimeSnapshot(key, runtimeId);
    return;
  }
  store.saveRuntimeSnapshot({
    schemaVersion: OFFLINE_TRAINING_STATE_SCHEMA_VERSION,
    key,
    runtimeId,
    remoteRevision: record.revision,
    updatedAt: record.updatedAt,
    pending: false,
    deleted: false,
    value: record.value,
  });
}

function assertSessionExpectedRevision(
  entry: OfflineSessionEntry | null,
  expectedRevision: number | null,
): number | null {
  if (!entry) return expectedRevision;
  const visibleRevision = virtualRevision(entry.remoteRevision);
  if (expectedRevision !== visibleRevision) {
    throw new TrainingStateConflictError(expectedRevision, visibleRevision);
  }
  return entry.remoteRevision;
}

function runtimeVisibleRevision(entry: OfflineRuntimeEntry): number | null {
  return entry.deleted ? null : virtualRevision(entry.remoteRevision);
}

function assertRuntimeExpectedRevision(
  entry: OfflineRuntimeEntry | null,
  expectedRevision: number | null,
): number | null {
  if (!entry) return expectedRevision;
  const visibleRevision = runtimeVisibleRevision(entry);
  if (expectedRevision !== visibleRevision) {
    throw new TrainingStateConflictError(expectedRevision, visibleRevision);
  }
  return entry.remoteRevision;
}

function pendingSession(
  key: TrainingStateKey,
  session: TrainingSession,
  remoteRevision: number | null,
  options: TrainingStateWriteOptions,
): OfflineSessionEntry {
  return {
    schemaVersion: OFFLINE_TRAINING_STATE_SCHEMA_VERSION,
    key,
    remoteRevision,
    updatedAt: options.updatedAt ?? Date.now(),
    pending: true,
    value: session,
  };
}

function pendingRuntime(
  key: TrainingStateKey,
  runtimeId: string,
  value: unknown,
  remoteRevision: number | null,
  options: TrainingStateWriteOptions,
): OfflineRuntimeEntry {
  return {
    schemaVersion: OFFLINE_TRAINING_STATE_SCHEMA_VERSION,
    key,
    runtimeId,
    remoteRevision,
    updatedAt: options.updatedAt ?? Date.now(),
    pending: true,
    deleted: false,
    value,
  };
}

function pendingRuntimeDelete(
  key: TrainingStateKey,
  runtimeId: string,
  remoteRevision: number | null,
  options: TrainingStateWriteOptions,
): OfflineRuntimeEntry {
  return {
    schemaVersion: OFFLINE_TRAINING_STATE_SCHEMA_VERSION,
    key,
    runtimeId,
    remoteRevision,
    updatedAt: options.updatedAt ?? Date.now(),
    pending: true,
    deleted: true,
  };
}

async function latestSessionAfterConflict(
  remote: TrainingStateRepository,
  store: OfflineTrainingStateStore,
  key: TrainingStateKey,
): Promise<TrainingStateRecord<StoredTrainingSession> | null> {
  const latest = await remote.loadSession(key);
  cacheSession(store, key, latest);
  return latest;
}

async function latestRuntimeAfterConflict(
  remote: TrainingStateRepository,
  store: OfflineTrainingStateStore,
  key: TrainingStateKey,
  runtimeId: string,
): Promise<TrainingStateRecord<unknown> | null> {
  const latest = await remote.loadRuntimeSnapshot(key, runtimeId);
  cacheRuntime(store, key, runtimeId, latest);
  return latest;
}

/**
 * Remote-authoritative repository with a browser cache/outbox for temporary connectivity loss.
 *
 * The outbox keeps the last observed remote revision as its CAS base. Multiple offline writes are
 * coalesced without advancing that base. On reconnect, a stale base can therefore never overwrite
 * a newer server record: the conditional remote write conflicts and the server state replaces the
 * buffered candidate.
 */
export class OfflineBufferedTrainingStateRepository
  implements TrainingStateRepository, PendingTrainingStateSynchronization
{
  readonly remote: TrainingStateRepository;
  readonly store: OfflineTrainingStateStore;

  constructor(remote: TrainingStateRepository, store: OfflineTrainingStateStore) {
    this.remote = remote;
    this.store = store;
  }

  async synchronizePendingSession(
    key: TrainingStateKey,
  ): Promise<PendingTrainingStateSynchronizationResult<StoredTrainingSession>> {
    const cached = this.store.loadSession(key);
    if (!cached?.pending) return { status: "none", record: null };

    try {
      const saved = await this.remote.saveSession(key, cached.value, {
        expectedRevision: cached.remoteRevision,
        updatedAt: cached.updatedAt,
      });
      cacheSession(this.store, key, saved);
      return { status: "synchronized", record: saved };
    } catch (error) {
      if (error instanceof TrainingStateConflictError) {
        const latest = await latestSessionAfterConflict(this.remote, this.store, key);
        return { status: "conflict", record: latest };
      }
      throw error;
    }
  }

  async loadSession(
    key: TrainingStateKey,
  ): Promise<TrainingStateRecord<StoredTrainingSession> | null> {
    const cached = this.store.loadSession(key);
    if (cached?.pending) {
      try {
        return (await this.synchronizePendingSession(key)).record;
      } catch (error) {
        if (error instanceof TrainingStateUnavailableError) return sessionRecord(cached);
        throw error;
      }
    }

    try {
      const remoteRecord = await this.remote.loadSession(key);
      cacheSession(this.store, key, remoteRecord);
      return remoteRecord;
    } catch (error) {
      if (error instanceof TrainingStateUnavailableError) {
        return cached ? sessionRecord(cached) : null;
      }
      throw error;
    }
  }

  async saveSession(
    key: TrainingStateKey,
    session: TrainingSession,
    options: TrainingStateWriteOptions,
  ): Promise<TrainingStateRecord<StoredTrainingSession>> {
    const cached = this.store.loadSession(key);
    const remoteRevision = assertSessionExpectedRevision(cached, options.expectedRevision);

    try {
      const saved = await this.remote.saveSession(key, session, {
        ...options,
        expectedRevision: remoteRevision,
      });
      cacheSession(this.store, key, saved);
      return saved;
    } catch (error) {
      if (error instanceof TrainingStateUnavailableError) {
        const buffered = pendingSession(key, session, remoteRevision, options);
        this.store.saveSession(buffered);
        return sessionRecord(buffered);
      }
      if (error instanceof TrainingStateConflictError) {
        let latest: TrainingStateRecord<StoredTrainingSession> | null = null;
        try {
          latest = await latestSessionAfterConflict(this.remote, this.store, key);
        } catch {
          throw error;
        }
        throw new TrainingStateConflictError(options.expectedRevision, latest?.revision ?? null);
      }
      throw error;
    }
  }

  async synchronizePendingRuntimeSnapshot(
    key: TrainingStateKey,
    runtimeId: string,
  ): Promise<PendingTrainingStateSynchronizationResult<unknown>> {
    const cached = this.store.loadRuntimeSnapshot(key, runtimeId);
    if (!cached?.pending) return { status: "none", record: null };

    try {
      if (cached.deleted) {
        await this.remote.deleteRuntimeSnapshot(key, runtimeId, {
          expectedRevision: cached.remoteRevision,
          updatedAt: cached.updatedAt,
        });
        this.store.deleteRuntimeSnapshot(key, runtimeId);
        return { status: "synchronized", record: null };
      }

      const saved = await this.remote.saveRuntimeSnapshot(key, runtimeId, cached.value, {
        expectedRevision: cached.remoteRevision,
        updatedAt: cached.updatedAt,
      });
      cacheRuntime(this.store, key, runtimeId, saved);
      return { status: "synchronized", record: saved };
    } catch (error) {
      if (error instanceof TrainingStateConflictError) {
        const latest = await latestRuntimeAfterConflict(this.remote, this.store, key, runtimeId);
        return { status: "conflict", record: latest };
      }
      throw error;
    }
  }

  async loadRuntimeSnapshot(
    key: TrainingStateKey,
    runtimeId: string,
  ): Promise<TrainingStateRecord<unknown> | null> {
    const cached = this.store.loadRuntimeSnapshot(key, runtimeId);
    if (cached?.pending) {
      try {
        return (await this.synchronizePendingRuntimeSnapshot(key, runtimeId)).record;
      } catch (error) {
        if (error instanceof TrainingStateUnavailableError) return runtimeRecord(cached);
        throw error;
      }
    }

    try {
      const remoteRecord = await this.remote.loadRuntimeSnapshot(key, runtimeId);
      cacheRuntime(this.store, key, runtimeId, remoteRecord);
      return remoteRecord;
    } catch (error) {
      if (error instanceof TrainingStateUnavailableError) {
        return cached ? runtimeRecord(cached) : null;
      }
      throw error;
    }
  }

  async saveRuntimeSnapshot(
    key: TrainingStateKey,
    runtimeId: string,
    snapshot: unknown,
    options: TrainingStateWriteOptions,
  ): Promise<TrainingStateRecord<unknown>> {
    const cached = this.store.loadRuntimeSnapshot(key, runtimeId);
    const remoteRevision = assertRuntimeExpectedRevision(cached, options.expectedRevision);

    try {
      const saved = await this.remote.saveRuntimeSnapshot(key, runtimeId, snapshot, {
        ...options,
        expectedRevision: remoteRevision,
      });
      cacheRuntime(this.store, key, runtimeId, saved);
      return saved;
    } catch (error) {
      if (error instanceof TrainingStateUnavailableError) {
        const buffered = pendingRuntime(key, runtimeId, snapshot, remoteRevision, options);
        this.store.saveRuntimeSnapshot(buffered);
        const record = runtimeRecord(buffered);
        if (!record) throw new Error("Buffered runtime snapshot unexpectedly resolved as deleted");
        return record;
      }
      if (error instanceof TrainingStateConflictError) {
        let latest: TrainingStateRecord<unknown> | null = null;
        try {
          latest = await latestRuntimeAfterConflict(this.remote, this.store, key, runtimeId);
        } catch {
          throw error;
        }
        throw new TrainingStateConflictError(options.expectedRevision, latest?.revision ?? null);
      }
      throw error;
    }
  }

  async deleteRuntimeSnapshot(
    key: TrainingStateKey,
    runtimeId: string,
    options: TrainingStateWriteOptions,
  ): Promise<void> {
    const cached = this.store.loadRuntimeSnapshot(key, runtimeId);
    const remoteRevision = assertRuntimeExpectedRevision(cached, options.expectedRevision);

    try {
      await this.remote.deleteRuntimeSnapshot(key, runtimeId, {
        ...options,
        expectedRevision: remoteRevision,
      });
      this.store.deleteRuntimeSnapshot(key, runtimeId);
    } catch (error) {
      if (error instanceof TrainingStateUnavailableError) {
        this.store.saveRuntimeSnapshot(
          pendingRuntimeDelete(key, runtimeId, remoteRevision, options),
        );
        return;
      }
      if (error instanceof TrainingStateConflictError) {
        let latest: TrainingStateRecord<unknown> | null = null;
        try {
          latest = await latestRuntimeAfterConflict(this.remote, this.store, key, runtimeId);
        } catch {
          throw error;
        }
        throw new TrainingStateConflictError(options.expectedRevision, latest?.revision ?? null);
      }
      throw error;
    }
  }
}
