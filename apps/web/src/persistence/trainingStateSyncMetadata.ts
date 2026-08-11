import type { TrainingStateKey } from "@ai-train-lab/training-engine";
import {
  runtimeSnapshotStorageKey,
  trainingSessionStorageKey,
  type StorageLike,
} from "@/state/localStorageTrainingStateRepository";

export const TRAINING_SYNC_METADATA_VERSION = 1 as const;

export interface TrainingStateSyncMetadata {
  version: typeof TRAINING_SYNC_METADATA_VERSION;
  remoteKnown: boolean;
  remoteRevision: number | null;
  dirty: boolean;
  lastSyncedAt: number | null;
}

export interface TrainingStateSyncMetadataStore {
  loadSession(key: TrainingStateKey): TrainingStateSyncMetadata | null;
  saveSession(key: TrainingStateKey, metadata: TrainingStateSyncMetadata): void;
  loadRuntime(key: TrainingStateKey, runtimeId: string): TrainingStateSyncMetadata | null;
  saveRuntime(
    key: TrainingStateKey,
    runtimeId: string,
    metadata: TrainingStateSyncMetadata,
  ): void;
  deleteRuntime(key: TrainingStateKey, runtimeId: string): void;
}

function sessionMetadataKey(key: TrainingStateKey): string {
  return `${trainingSessionStorageKey(key)}:sync:v1`;
}

function runtimeMetadataKey(key: TrainingStateKey, runtimeId: string): string {
  return `${runtimeSnapshotStorageKey(key, runtimeId)}:sync:v1`;
}

function parseMetadata(raw: string | null): TrainingStateSyncMetadata | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    if (candidate["version"] !== TRAINING_SYNC_METADATA_VERSION) return null;
    if (typeof candidate["remoteKnown"] !== "boolean") return null;
    if (candidate["dirty"] !== true && candidate["dirty"] !== false) return null;
    if (
      candidate["remoteRevision"] !== null &&
      (typeof candidate["remoteRevision"] !== "number" ||
        !Number.isInteger(candidate["remoteRevision"]) ||
        candidate["remoteRevision"] < 0)
    ) {
      return null;
    }
    if (
      candidate["lastSyncedAt"] !== null &&
      (typeof candidate["lastSyncedAt"] !== "number" ||
        !Number.isFinite(candidate["lastSyncedAt"]))
    ) {
      return null;
    }

    return {
      version: TRAINING_SYNC_METADATA_VERSION,
      remoteKnown: candidate["remoteKnown"],
      remoteRevision: candidate["remoteRevision"] as number | null,
      dirty: candidate["dirty"],
      lastSyncedAt: candidate["lastSyncedAt"] as number | null,
    };
  } catch {
    return null;
  }
}

export class LocalStorageTrainingStateSyncMetadataStore implements TrainingStateSyncMetadataStore {
  private readonly storage: StorageLike;

  constructor(storage: StorageLike) {
    this.storage = storage;
  }

  loadSession(key: TrainingStateKey): TrainingStateSyncMetadata | null {
    return parseMetadata(this.storage.getItem(sessionMetadataKey(key)));
  }

  saveSession(key: TrainingStateKey, metadata: TrainingStateSyncMetadata): void {
    this.storage.setItem(sessionMetadataKey(key), JSON.stringify(metadata));
  }

  loadRuntime(key: TrainingStateKey, runtimeId: string): TrainingStateSyncMetadata | null {
    return parseMetadata(this.storage.getItem(runtimeMetadataKey(key, runtimeId)));
  }

  saveRuntime(
    key: TrainingStateKey,
    runtimeId: string,
    metadata: TrainingStateSyncMetadata,
  ): void {
    this.storage.setItem(runtimeMetadataKey(key, runtimeId), JSON.stringify(metadata));
  }

  deleteRuntime(key: TrainingStateKey, runtimeId: string): void {
    this.storage.removeItem(runtimeMetadataKey(key, runtimeId));
  }
}

export function createBrowserTrainingStateSyncMetadataStore(): TrainingStateSyncMetadataStore {
  if (typeof window === "undefined") {
    throw new Error("Browser training sync metadata requires window.localStorage");
  }
  return new LocalStorageTrainingStateSyncMetadataStore(window.localStorage);
}
