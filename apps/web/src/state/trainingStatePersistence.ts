import { TrainingStateConflictError, restoreTrainingSession } from "@ai-train-lab/training-engine";
import type {
  Scenario,
  TrainingSession,
  TrainingStateKey,
  TrainingStateRepository,
} from "@ai-train-lab/training-engine";

export interface TrainingStateLoadResult {
  session: TrainingSession;
  revision: number | null;
}

/**
 * Application-level coordinator for one user/scenario/mode persistence scope.
 *
 * It serializes writes so React state updates cannot create self-conflicts and
 * keeps repository revisions outside UI components. A real concurrent write
 * resolves to the repository's latest persisted session, which is the same
 * authority rule required once the remote repository becomes primary.
 */
export class TrainingStatePersistence {
  private readonly repository: TrainingStateRepository;
  private readonly key: TrainingStateKey;
  private readonly scenario: Scenario;
  private sessionRevision: number | null = null;
  private sessionWriteChain: Promise<void> = Promise.resolve();
  private readonly runtimeRevisions = new Map<string, number | null>();
  private readonly runtimeWriteChains = new Map<string, Promise<void>>();
  private readonly runtimesRequiringRestore = new Set<string>();

  constructor(repository: TrainingStateRepository, key: TrainingStateKey, scenario: Scenario) {
    this.repository = repository;
    this.key = key;
    this.scenario = scenario;
  }

  async loadSession(): Promise<TrainingStateLoadResult> {
    await this.sessionWriteChain;
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
  }

  saveSession(session: TrainingSession): Promise<TrainingSession | null> {
    const operation = this.sessionWriteChain.then(async () => {
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
        return restoreTrainingSession(
          this.scenario,
          this.scenario.id,
          latest?.value,
          Date.now(),
          this.key.subject,
        );
      }
    });

    this.sessionWriteChain = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async loadRuntimeSnapshot(runtimeId: string): Promise<unknown | null> {
    await (this.runtimeWriteChains.get(runtimeId) ?? Promise.resolve());
    const record = await this.repository.loadRuntimeSnapshot(this.key, runtimeId);
    this.runtimeRevisions.set(runtimeId, record?.revision ?? null);
    this.runtimesRequiringRestore.delete(runtimeId);
    return record?.value ?? null;
  }

  saveRuntimeSnapshot(runtimeId: string, snapshot: unknown): Promise<void> {
    const previous = this.runtimeWriteChains.get(runtimeId) ?? Promise.resolve();
    const operation = previous.then(async () => {
      if (!this.runtimeRevisions.has(runtimeId)) {
        const current = await this.repository.loadRuntimeSnapshot(this.key, runtimeId);
        this.runtimeRevisions.set(runtimeId, current?.revision ?? null);
        if (current) {
          this.runtimesRequiringRestore.add(runtimeId);
          return;
        }
      }

      if (this.runtimesRequiringRestore.has(runtimeId)) return;

      try {
        const saved = await this.repository.saveRuntimeSnapshot(this.key, runtimeId, snapshot, {
          expectedRevision: this.runtimeRevisions.get(runtimeId) ?? null,
        });
        this.runtimeRevisions.set(runtimeId, saved.revision);
      } catch (error) {
        if (!(error instanceof TrainingStateConflictError)) throw error;
        const latest = await this.repository.loadRuntimeSnapshot(this.key, runtimeId);
        this.runtimeRevisions.set(runtimeId, latest?.revision ?? null);
        this.runtimesRequiringRestore.add(runtimeId);
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
      } catch (error) {
        if (!(error instanceof TrainingStateConflictError)) throw error;
        const latest = await this.repository.loadRuntimeSnapshot(this.key, runtimeId);
        this.runtimeRevisions.set(runtimeId, latest?.revision ?? null);
        if (latest) this.runtimesRequiringRestore.add(runtimeId);
        else this.runtimesRequiringRestore.delete(runtimeId);
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
}
