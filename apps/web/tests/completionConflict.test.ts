import assert from "node:assert/strict";
import test from "node:test";
import {
  completeTrainingStep,
  createTrainingSession,
  recordLastAction,
  recordMistake,
} from "@ai-train-lab/training-engine";
import type {
  Scenario,
  StoredTrainingSession,
  TrainingSession,
  TrainingStateKey,
  TrainingStateRecord,
  TrainingStateRepository,
  TrainingStateWriteOptions,
} from "@ai-train-lab/training-engine";
import { LocalStorageOfflineTrainingStateStore } from "../src/persistence/adapters/localStorageOfflineTrainingStateStore.ts";
import {
  LocalStorageTrainingStateRepository,
  type StorageLike,
} from "../src/persistence/adapters/localStorageTrainingStateRepository.ts";
import { OfflineBufferedTrainingStateRepository } from "../src/persistence/offlineBufferedTrainingStateRepository.ts";
import { TrainingStatePersistence } from "../src/state/trainingStatePersistence.ts";

// #578: A finished guided training vanished right after its completion screen appeared: the learner was
// back on the last step, which was ACTIVE again, and no score was awarded. The completion write had
// run into a revision conflict, and the conflict handling replaced the finished local session with
// the older, unfinished server snapshot of the same attempt while reporting the save as confirmed.

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

/** Reads the record when the read starts and answers only when the test releases it. */
class HeldReadRepository implements TrainingStateRepository {
  private held: Array<() => void> = [];
  private readonly delegate: TrainingStateRepository;
  holdReads = false;

  constructor(delegate: TrainingStateRepository) {
    this.delegate = delegate;
  }

  async loadSession(key: TrainingStateKey) {
    const hold = this.holdReads;
    const record = await this.delegate.loadSession(key);
    if (!hold) return record;
    await new Promise<void>((resolve) => this.held.push(resolve));
    return record;
  }

  get heldReads(): number {
    return this.held.length;
  }

  releaseReads(): void {
    this.holdReads = false;
    for (const release of this.held.splice(0)) release();
  }

  saveSession(key: TrainingStateKey, session: TrainingSession, options: TrainingStateWriteOptions) {
    return this.delegate.saveSession(key, session, options);
  }

  loadRuntimeSnapshot(key: TrainingStateKey, runtimeId: string) {
    return this.delegate.loadRuntimeSnapshot(key, runtimeId);
  }

  saveRuntimeSnapshot(
    key: TrainingStateKey,
    runtimeId: string,
    snapshot: unknown,
    options: TrainingStateWriteOptions,
  ) {
    return this.delegate.saveRuntimeSnapshot(key, runtimeId, snapshot, options);
  }

  deleteRuntimeSnapshot(
    key: TrainingStateKey,
    runtimeId: string,
    options: TrainingStateWriteOptions,
  ) {
    return this.delegate.deleteRuntimeSnapshot(key, runtimeId, options);
  }
}

const scenario: Scenario = {
  id: "completion-conflict.guided",
  mode: "guided",
  title: "Completion conflict",
  description: "Completion conflict fixture",
  steps: ["open_problems", "open_output"].map((id) => ({
    id,
    stepType: "explanation" as const,
    title: id,
    description: id,
    instruction: id,
    helpLevels: ["a", "b", "c"] as [string, string, string],
    successMessage: "done",
  })),
};

const subject = { userId: "alice", tenantId: "tenant-a" };
const key: TrainingStateKey = { subject, scenarioId: scenario.id, mode: "guided" };

function lastStepActive(startedAt: number): TrainingSession {
  const fresh = createTrainingSession(scenario, scenario.id, startedAt, subject);
  return recordMistake(completeTrainingStep(fresh, scenario, "open_problems", startedAt + 1));
}

function finished(session: TrainingSession): TrainingSession {
  return completeTrainingStep(session, scenario, "open_output", session.startedAt + 2);
}

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function stored(
  repository: TrainingStateRepository,
): Promise<TrainingStateRecord<StoredTrainingSession> | null> {
  return repository.loadSession(key);
}

test("a stale concurrent read does not move the shared revision cache backwards", async () => {
  const server = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const remote = new HeldReadRepository(server);
  const cache = new LocalStorageOfflineTrainingStateStore(new MemoryStorage());
  const training = new OfflineBufferedTrainingStateRepository(remote, cache);
  // The completion screen loads every training's session through its own repository instance.
  const reader = new OfflineBufferedTrainingStateRepository(remote, cache);

  const first = await training.saveSession(key, lastStepActive(1_000), { expectedRevision: null });
  remote.holdReads = true;
  const staleRead = reader.loadSession(key);
  const second = await training.saveSession(key, recordLastAction(lastStepActive(1_000), "x"), {
    expectedRevision: first.revision,
  });
  remote.releaseReads();
  assert.equal((await staleRead)?.revision, 1);

  assert.equal(cache.loadSession(key)?.remoteRevision, second.revision);
  const third = await training.saveSession(key, finished(lastStepActive(1_000)), {
    expectedRevision: second.revision,
  });
  assert.equal(third.revision, 3);
});

test("a completion is persisted although a stale read raced the previous write", async () => {
  const server = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const remote = new HeldReadRepository(server);
  const cache = new LocalStorageOfflineTrainingStateStore(new MemoryStorage());
  const persistence = new TrainingStatePersistence(
    new OfflineBufferedTrainingStateRepository(remote, cache),
    key,
    scenario,
  );
  const reader = new OfflineBufferedTrainingStateRepository(remote, cache);

  await persistence.loadSession();
  const beforeLastStep = lastStepActive(1_000);
  assert.equal(await persistence.saveSession(beforeLastStep), null);
  remote.holdReads = true;
  const staleRead = reader.loadSession(key);
  const lastAction = recordLastAction(beforeLastStep, "panel.opened");
  assert.equal(await persistence.saveSession(lastAction), null);
  remote.releaseReads();
  await staleRead;

  const done = finished(lastAction);
  const authoritative = await persistence.saveSession(done);

  // Either nothing replaces the finished session or the replacement is the same completion.
  assert.equal(authoritative?.finishedAt ?? done.finishedAt, done.finishedAt);
  assert.equal((await stored(server))?.value.finishedAt, done.finishedAt);
});

test("a finished attempt supersedes an older unfinished snapshot of the same attempt", async () => {
  const server = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const training = new TrainingStatePersistence(server, key, scenario);
  const otherWriter = new TrainingStatePersistence(server, key, scenario);

  await training.loadSession();
  const beforeLastStep = lastStepActive(1_000);
  await training.saveSession(beforeLastStep);
  await otherWriter.loadSession();
  await otherWriter.saveSession(recordLastAction(beforeLastStep, "panel.opened"));

  const done = finished(beforeLastStep);
  assert.equal(await training.saveSession(done), null);
  const record = await stored(server);
  assert.equal(record?.revision, 3);
  assert.equal(record?.value.finishedAt, done.finishedAt);
});

test("a completion does not override a restarted attempt", async () => {
  const server = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const training = new TrainingStatePersistence(server, key, scenario);
  const otherTab = new TrainingStatePersistence(server, key, scenario);

  await training.loadSession();
  const beforeLastStep = lastStepActive(1_000);
  await training.saveSession(beforeLastStep);
  await otherTab.loadSession();
  const restarted = createTrainingSession(scenario, scenario.id, 5_000, subject);
  await otherTab.saveSession(restarted);

  const authoritative = await training.saveSession(finished(beforeLastStep));
  assert.equal(authoritative?.startedAt, restarted.startedAt);
  assert.equal(authoritative?.finishedAt, null);
  assert.equal((await stored(server))?.value.startedAt, restarted.startedAt);
});

test("a completion keeps a completion that was already persisted", async () => {
  const server = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const training = new TrainingStatePersistence(server, key, scenario);
  const otherTab = new TrainingStatePersistence(server, key, scenario);

  await training.loadSession();
  const beforeLastStep = lastStepActive(1_000);
  await training.saveSession(beforeLastStep);
  await otherTab.loadSession();
  const otherCompletion = completeTrainingStep(beforeLastStep, scenario, "open_output", 1_500);
  await otherTab.saveSession(otherCompletion);

  const authoritative = await training.saveSession(finished(beforeLastStep));
  assert.equal(authoritative?.finishedAt, otherCompletion.finishedAt);
  assert.equal((await stored(server))?.revision, 2);
});

test("loading the session waits for writes queued before and during the read", async () => {
  const server = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const remote = new HeldReadRepository(server);
  const persistence = new TrainingStatePersistence(remote, key, scenario);

  await persistence.loadSession();
  const beforeLastStep = lastStepActive(1_000);
  await persistence.saveSession(beforeLastStep);

  remote.holdReads = true;
  const load = persistence.loadSession();
  const write = persistence.saveSession(recordLastAction(beforeLastStep, "panel.opened"));
  while (remote.heldReads === 0) await settle();
  // Give a write that does not wait for the read the chance to finish first.
  await settle();
  remote.releaseReads();
  await Promise.all([load, write]);

  // A read that answered with revision 1 after revision 2 was written must not rewind the client.
  assert.equal(await persistence.saveSession(finished(beforeLastStep)), null);
  assert.equal((await stored(server))?.revision, 3);
});

test("a cache that disagrees with the caller is refreshed from the server before the conflict", async () => {
  const server = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const cache = new LocalStorageOfflineTrainingStateStore(new MemoryStorage());
  const training = new OfflineBufferedTrainingStateRepository(server, cache);

  const saved = await training.saveSession(key, lastStepActive(1_000), { expectedRevision: null });
  // A cache entry from elsewhere that claims a revision the server never wrote.
  cache.saveSession({ ...cache.loadSession(key)!, remoteRevision: saved.revision + 5 });

  await assert.rejects(
    training.saveSession(key, finished(lastStepActive(1_000)), {
      expectedRevision: saved.revision,
    }),
    { name: "TrainingStateConflictError" },
  );
  assert.equal(cache.loadSession(key)?.remoteRevision, saved.revision);
  const retried = await training.saveSession(key, finished(lastStepActive(1_000)), {
    expectedRevision: saved.revision,
  });
  assert.equal(retried.revision, saved.revision + 1);
});
