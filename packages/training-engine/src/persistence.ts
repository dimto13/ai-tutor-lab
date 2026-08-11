import type { StoredTrainingSession, TrainingSession, TrainingSubjectRef } from "./stateMachine.ts";
import type { TrainingMode } from "./types.ts";

export const TRAINING_STATE_SCHEMA_VERSION = 1 as const;

/** Stable owner/scenario identity used by local and remote persistence adapters. */
export interface TrainingStateKey {
  subject: TrainingSubjectRef;
  scenarioId: string;
  mode: TrainingMode;
}

export interface TrainingStateRecord<T> {
  schemaVersion: typeof TRAINING_STATE_SCHEMA_VERSION;
  key: TrainingStateKey;
  revision: number;
  updatedAt: number;
  value: T;
}

export interface TrainingStateWriteOptions {
  /**
   * Optimistic concurrency token. `null` means that no current record may exist.
   * Adapters must reject a write when the persisted revision differs.
   */
  expectedRevision: number | null;
  updatedAt?: number;
}

export class TrainingStateConflictError extends Error {
  readonly expectedRevision: number | null;
  readonly actualRevision: number | null;

  constructor(expectedRevision: number | null, actualRevision: number | null) {
    super(
      `Training state revision conflict: expected ${expectedRevision ?? "none"}, actual ${actualRevision ?? "none"}`,
    );
    this.name = "TrainingStateConflictError";
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

/**
 * Cloud-neutral persistence boundary for resumable training state.
 *
 * Runtime snapshots intentionally remain opaque to the training engine. Runtime
 * adapters own their concrete shape; persistence only versions and scopes them.
 */
export interface TrainingStateRepository {
  loadSession(key: TrainingStateKey): Promise<TrainingStateRecord<StoredTrainingSession> | null>;
  saveSession(
    key: TrainingStateKey,
    session: TrainingSession,
    options: TrainingStateWriteOptions,
  ): Promise<TrainingStateRecord<StoredTrainingSession>>;

  loadRuntimeSnapshot(
    key: TrainingStateKey,
    runtimeId: string,
  ): Promise<TrainingStateRecord<unknown> | null>;
  saveRuntimeSnapshot(
    key: TrainingStateKey,
    runtimeId: string,
    snapshot: unknown,
    options: TrainingStateWriteOptions,
  ): Promise<TrainingStateRecord<unknown>>;
  deleteRuntimeSnapshot(key: TrainingStateKey, runtimeId: string): Promise<void>;
}

export function sameTrainingSubject(
  left: TrainingSubjectRef | null | undefined,
  right: TrainingSubjectRef | null | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.userId === right.userId && left.tenantId === right.tenantId;
}

export function sameTrainingStateKey(left: TrainingStateKey, right: TrainingStateKey): boolean {
  return (
    left.scenarioId === right.scenarioId &&
    left.mode === right.mode &&
    sameTrainingSubject(left.subject, right.subject)
  );
}
