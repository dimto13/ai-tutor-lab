import {
  TrainingStateConflictError,
  finishedAttemptSupersedes,
  restoreTrainingSession,
} from "@ai-train-lab/training-engine";
import type {
  Scenario,
  TrainingSession,
  TrainingStateKey,
  TrainingStateRepository,
} from "@ai-train-lab/training-engine";
import { supportsPendingTrainingStateSynchronization } from "../persistence/pendingTrainingStateSynchronization.ts";

export interface TrainingStateLoadResult {
  session: TrainingSession;
  revision: number | null;
}

export interface RuntimeReconnectRestore {
  runtimeId: string;
  snapshot: unknown | null;
}

export interface TrainingStateReconnectResult {
  /** Present only when reconnect discovered a newer authoritative server session. */
  session: TrainingSession | null;
  runtimeRestores: RuntimeReconnectRestore[];
}

const MAX_COMPLETION_REBASE_ATTEMPTS = 3;
const MAX_RUNTIME_RESTORE_ATTEMPTS = 5;

/**
 * Application-level coordinator for one user/scenario/mode persistence scope.
 *
 * It serializes reads and writes so React state updates cannot create self-conflicts and
 * keeps repository revisions outside UI components. A real concurrent write
 * resolves to the repository's latest persisted session, which is the same
 * authority rule required once the remote repository becomes primary. The one
 * exception is a completion: it is written on top of an older unfinished snapshot
 * of the same attempt instead of being discarded (`finishedAttemptSupersedes`).
 */
export class TrainingStatePersistence {
  private readonly repository: TrainingStateRepository;
  private readonly key: TrainingStateKey;
  private readonly scenario: Scenario;
  private sessionRevision: number | null = null;
  private sessionWriteChain: Promise<void> = Promise.resolve();
  private readonly runtimeRevisions = new Map<string, number | null>();
  private readonly runtimeWriteChains = new Map<string, Promise<void>>();
  private readonly runtimeMutationVersions = new Map<string, number>();
  private readonly runtimesRequiringRestore = new Set<string>();

  constructor(repository: TrainingStateRepository, key: TrainingStateKey, scenario: Scenario) {
    this.repository = repository;
    this.key = key;
    this.scenario = scenario;
  }

  loadSession(): Promise<TrainingStateLoadResult> {
    // A read runs in the write chain: answering with an older revision after a newer write would
    // otherwise rewind `sessionRevision` and turn the next write into a conflict.
    const operation = this.sessionWriteChain.then(async () => {
      const record = await this.repository.loadSession(this.key);
      this.sessionRevision = record?.revision ?? null;
      return {
        session: restoreTrainingSession(
          this.scenario,
          this.scenario.id,
          record?.value,
          Date.now(),
          this.key.subject,
        ),
        revision: this.sessionRevision,
      };
    });

    this.sessionWriteChain = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  saveSession(session: TrainingSession): Promise<TrainingSession | null> {
    const operation = this.sessionWriteChain.then(async () => {
      for (let attempt = 1; ; attempt += 1) {
        try {
          const saved = await this.repository.saveSession(this.key, session, {
            expectedRevision: this.sessionRevision,
          });
          this.sessionRevision = saved.revision;
          return null;
        } catch (error) {
          if (!(error instanceof TrainingStateConflictError)) throw error;
          const latest = await this.repository.loadSession(this.key);
          this.sessionRevision = latest?.revision ?? null;
          const persisted = restoreTrainingSession(
            this.scenario,
            this.scenario.id,
            latest?.value,
            Date.now(),
            this.key.subject,
          );
          // Discarding a finished attempt here made the completion screen vanish and left the
          // last step active again (#578). A repeated conflict surfaces as a save error with retry.
          if (!latest || !finishedAttemptSupersedes(session, persisted)) return persisted;
          if (attempt >= MAX_COMPLETION_REBASE_ATTEMPTS) throw error;
        }
      }
    });

    this.sessionWriteChain = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async loadRuntimeSnapshot(runtimeId: string): Promise<unknown | null> {
    // Do not let a slow read that started before a local mutation rewind the
    // revision cache or restore an obsolete snapshot over the newer artifact.
    // A stream of mutations must not keep the caller waiting indefinitely.
    // Never return a read from an invalidated generation; surface an error instead.
    for (let attempt = 0; attempt < MAX_RUNTIME_RESTORE_ATTEMPTS; attempt += 1) {
      await (this.runtimeWriteChains.get(runtimeId) ?? Promise.resolve());
      const version = this.runtimeMutationVersions.get(runtimeId) ?? 0;
      const record = await this.repository.loadRuntimeSnapshot(this.key, runtimeId);
      await (this.runtimeWriteChains.get(runtimeId) ?? Promise.resolve());
      if ((this.runtimeMutationVersions.get(runtimeId) ?? 0) !== version) continue;

      this.runtimeRevisions.set(runtimeId, record?.revision ?? null);
      this.runtimesRequiringRestore.delete(runtimeId);
      return record?.value ?? null;
    }
    throw new Error("Runtime snapshot changed during restore; retry after mutations settle");
  }

  private noteRuntimeMutation(runtimeId: string): void {
    this.runtimeMutationVersions.set(
      runtimeId,
      (this.runtimeMutationVersions.get(runtimeId) ?? 0) + 1,
    );
  }

  saveRuntimeSnapshot(runtimeId: string, snapshot: unknown): Promise<void> {
    const previous = this.runtimeWriteChains.get(runtimeId) ?? Promise.resolve();
    const operation = previous.then(async () => {
      if (!this.runtimeRevisions.has(runtimeId)) {
        const current = await this.repository.loadRuntimeSnapshot(this.key, runtimeId);
        this.runtimeRevisions.set(runtimeId, current?.revision ?? null);
        if (current) {
          this.runtimesRequiringRestore.add(runtimeId);
          this.noteRuntimeMutation(runtimeId);
          return;
        }
      }

      if (this.runtimesRequiringRestore.has(runtimeId)) return;

      try {
        const saved = await this.repository.saveRuntimeSnapshot(this.key, runtimeId, snapshot, {
          expectedRevision: this.runtimeRevisions.get(runtimeId) ?? null,
        });
        this.runtimeRevisions.set(runtimeId, saved.revision);
        this.noteRuntimeMutation(runtimeId);
      } catch (error) {
        if (!(error instanceof TrainingStateConflictError)) throw error;
        const latest = await this.repository.loadRuntimeSnapshot(this.key, runtimeId);
        this.runtimeRevisions.set(runtimeId, latest?.revision ?? null);
        this.runtimesRequiringRestore.add(runtimeId);
        this.noteRuntimeMutation(runtimeId);
      }
    });

    this.runtimeWriteChains.set(
      runtimeId,
      operation.then(
        () => undefined,
        () => undefined,
      ),
    );
    return operation;
  }

  deleteRuntimeSnapshot(runtimeId: string): Promise<void> {
    const previous = this.runtimeWriteChains.get(runtimeId) ?? Promise.resolve();
    const operation = previous.then(async () => {
      if (this.runtimesRequiringRestore.has(runtimeId)) {
        throw new Error("Runtime snapshot must be restored before it can be deleted");
      }

      if (!this.runtimeRevisions.has(runtimeId)) {
        const current = await this.repository.loadRuntimeSnapshot(this.key, runtimeId);
        this.runtimeRevisions.set(runtimeId, current?.revision ?? null);
      }

      try {
        await this.repository.deleteRuntimeSnapshot(this.key, runtimeId, {
          expectedRevision: this.runtimeRevisions.get(runtimeId) ?? null,
        });
        this.runtimeRevisions.set(runtimeId, null);
        this.runtimesRequiringRestore.delete(runtimeId);
        this.noteRuntimeMutation(runtimeId);
      } catch (error) {
        if (!(error instanceof TrainingStateConflictError)) throw error;
        const latest = await this.repository.loadRuntimeSnapshot(this.key, runtimeId);
        this.runtimeRevisions.set(runtimeId, latest?.revision ?? null);
        if (latest) this.runtimesRequiringRestore.add(runtimeId);
        else this.runtimesRequiringRestore.delete(runtimeId);
        this.noteRuntimeMutation(runtimeId);
        throw error;
      }
    });

    this.runtimeWriteChains.set(
      runtimeId,
      operation.then(
        () => undefined,
        () => undefined,
      ),
    );
    return operation;
  }

  async synchronizeAfterReconnect(
    runtimeIds: readonly string[],
  ): Promise<TrainingStateReconnectResult> {
    if (!supportsPendingTrainingStateSynchronization(this.repository)) {
      return { session: null, runtimeRestores: [] };
    }

    await this.sessionWriteChain;
    const sessionResult = await this.repository.synchronizePendingSession(this.key);
    let session: TrainingSession | null = null;
    if (sessionResult.status !== "none") {
      this.sessionRevision = sessionResult.record?.revision ?? null;
      if (sessionResult.status === "conflict") {
        session = restoreTrainingSession(
          this.scenario,
          this.scenario.id,
          sessionResult.record?.value,
          Date.now(),
          this.key.subject,
        );
      }
    }

    const runtimeRestores: RuntimeReconnectRestore[] = [];
    for (const runtimeId of runtimeIds) {
      await (this.runtimeWriteChains.get(runtimeId) ?? Promise.resolve());
      const result = await this.repository.synchronizePendingRuntimeSnapshot(this.key, runtimeId);
      if (result.status === "none") continue;

      this.runtimeRevisions.set(runtimeId, result.record?.revision ?? null);
      this.noteRuntimeMutation(runtimeId);
      if (result.status === "conflict") {
        this.runtimesRequiringRestore.add(runtimeId);
        runtimeRestores.push({ runtimeId, snapshot: result.record?.value ?? null });
      }
    }

    return { session, runtimeRestores };
  }

  markRuntimeSnapshotRestored(runtimeId: string): void {
    this.runtimesRequiringRestore.delete(runtimeId);
  }
}
