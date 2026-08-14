import type {
  StoredTrainingSession,
  TrainingSession,
  TrainingStateKey,
} from "@ai-train-lab/training-engine";

export const OFFLINE_TRAINING_STATE_SCHEMA_VERSION = 1 as const;

export class OfflineTrainingStateStorageError extends Error {
  readonly operation: "save-session" | "save-runtime";
  readonly originalError: unknown;

  constructor(
    operation: "save-session" | "save-runtime",
    originalError: unknown,
  ) {
    super(`Offline training state could not be durably stored during ${operation}`);
    this.name = "OfflineTrainingStateStorageError";
    this.operation = operation;
    this.originalError = originalError;
  }
}

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
