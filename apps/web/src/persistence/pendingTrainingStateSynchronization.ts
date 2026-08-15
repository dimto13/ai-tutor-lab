import type {
  StoredTrainingSession,
  TrainingStateKey,
  TrainingStateRecord,
  TrainingStateRepository,
} from "@ai-train-lab/training-engine";

export type PendingTrainingStateSynchronizationStatus = "none" | "synchronized" | "conflict";

export interface PendingTrainingStateSynchronizationResult<T> {
  status: PendingTrainingStateSynchronizationStatus;
  record: TrainingStateRecord<T> | null;
}

/**
 * Optional application-layer capability implemented by repositories with a durable offline outbox.
 *
 * It intentionally stays outside the training-engine repository contract: cloud/local repositories
 * do not need offline concepts. The web application can use this capability on browser reconnect to
 * flush only pending state without creating a new revision for already synchronized records.
 */
export interface PendingTrainingStateSynchronization {
  synchronizePendingSession(
    key: TrainingStateKey,
  ): Promise<PendingTrainingStateSynchronizationResult<StoredTrainingSession>>;
  synchronizePendingRuntimeSnapshot(
    key: TrainingStateKey,
    runtimeId: string,
  ): Promise<PendingTrainingStateSynchronizationResult<unknown>>;
}

export function supportsPendingTrainingStateSynchronization(
  repository: TrainingStateRepository,
): repository is TrainingStateRepository & PendingTrainingStateSynchronization {
  const candidate = repository as Partial<PendingTrainingStateSynchronization>;
  return (
    typeof candidate.synchronizePendingSession === "function" &&
    typeof candidate.synchronizePendingRuntimeSnapshot === "function"
  );
}
