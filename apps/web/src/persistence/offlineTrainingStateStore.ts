import type {
  StoredTrainingSession,
  TrainingSession,
  TrainingStateKey,
} from "@ai-train-lab/training-engine";

export const OFFLINE_TRAINING_STATE_SCHEMA_VERSION = 1 as const;

interface OfflineEntryBase {
  schemaVersion: typeof OFFLINE_TRAINING_STATE_SCHEMA_VERSION;
  key: TrainingStateKey;
  /** Revision of the last remote state this browser observed. `null` means confirmed/new absence. */
  remoteRevision: number | null;
  updatedAt: number;
}

export type OfflineSessionEntry =
  | (OfflineEntryBase & {
      pending: false;
      value: StoredTrainingSession;
    })
  | (OfflineEntryBase & {
      pending: true;
      value: TrainingSession;
    });

export interface OfflineRuntimeEntry extends OfflineEntryBase {
  runtimeId: string;
  pending: boolean;
  deleted: boolean;
  value?: unknown;
}

/** Browser-side cache/outbox metadata. It is not an authoritative persistence repository. */
export interface OfflineTrainingStateStore {
  loadSession(key: TrainingStateKey): OfflineSessionEntry | null;
  saveSession(entry: OfflineSessionEntry): void;
  deleteSession(key: TrainingStateKey): void;

  loadRuntimeSnapshot(key: TrainingStateKey, runtimeId: string): OfflineRuntimeEntry | null;
  saveRuntimeSnapshot(entry: OfflineRuntimeEntry): void;
  deleteRuntimeSnapshot(key: TrainingStateKey, runtimeId: string): void;
}
