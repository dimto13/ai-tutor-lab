import assert from "node:assert/strict";
import test from "node:test";
import {
  TrainingStateConflictError,
  TrainingStateUnavailableError,
  createTrainingSession,
  recordLastAction,
} from "@ai-train-lab/training-engine";
import type {
  Scenario,
  TrainingSession,
  TrainingStateKey,
  TrainingStateRepository,
  TrainingStateWriteOptions,
} from "@ai-train-lab/training-engine";
import { LocalStorageOfflineTrainingStateStore } from "../src/persistence/adapters/localStorageOfflineTrainingStateStore.ts";
import {
  LocalStorageTrainingStateRepository,
  type StorageLike,
} from "../src/persistence/adapters/localStorageTrainingStateRepository.ts";
import { OfflineBufferedTrainingStateRepository } from "../src/persistence/offlineBufferedTrainingStateRepository.ts";

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

type FailureMode = "available" | "unavailable" | "generic";

class SwitchableTrainingStateRepository implements TrainingStateRepository {
  readonly delegate: TrainingStateRepository;
  failureMode: FailureMode = "available";
  sessionSaveCalls = 0;
  runtimeSaveCalls = 0;
  runtimeDeleteCalls = 0;

  constructor(delegate: TrainingStateRepository) {
    this.delegate = delegate;
  }

  checkAvailability(): void {
    if (this.failureMode === "unavailable") throw new TrainingStateUnavailableError();
    if (this.failureMode === "generic") throw new Error("Not authorized to access training state");
  }

  async loadSession(key: TrainingStateKey) {
    this.checkAvailability();
    return this.delegate.loadSession(key);
  }

  async saveSession(
    key: TrainingStateKey,
    session: TrainingSession,
    options: TrainingStateWriteOptions,
  ) {
    this.checkAvailability();
    this.sessionSaveCalls += 1;
    return this.delegate.saveSession(key, session, options);
  }

  async loadRuntimeSnapshot(key: TrainingStateKey, runtimeId: string) {
    this.checkAvailability();
    return this.delegate.loadRuntimeSnapshot(key, runtimeId);
  }

  async saveRuntimeSnapshot(
    key: TrainingStateKey,
    runtimeId: string,
    snapshot: unknown,
    options: TrainingStateWriteOptions,
  ) {
    this.checkAvailability();
    this.runtimeSaveCalls += 1;
    return this.delegate.saveRuntimeSnapshot(key, runtimeId, snapshot, options);
  }

  async deleteRuntimeSnapshot(
    key: TrainingStateKey,
    runtimeId: string,
    options: TrainingStateWriteOptions,
  ) {
    this.checkAvailability();
    this.runtimeDeleteCalls += 1;
    return this.delegate.deleteRuntimeSnapshot(key, runtimeId, options);
  }
}

const scenario: Scenario = {
  id: "offline-sync.guided",
  mode: "guided",
  title: "Offline sync",
  description: "Offline sync fixture",
  steps: [
    {
      id: "one",
      stepType: "explanation",
      title: "One",
      description: "One",
      instruction: "One",
      helpLevels: ["a", "b", "c"],
      successMessage: "done",
    },
  ],
};

const key: TrainingStateKey = {
  subject: { userId: "alice", tenantId: "tenant-a" },
  scenarioId: scenario.id,
  mode: "guided",
};

function session(lastAction: string): TrainingSession {
  return recordLastAction(createTrainingSession(scenario, scenario.id, 100, key.subject), lastAction);
}

function fixture() {
  const remoteStorage = new MemoryStorage();
  const remoteDelegate = new LocalStorageTrainingStateRepository(remoteStorage);
  const remote = new SwitchableTrainingStateRepository(remoteDelegate);
  const offlineStorage = new MemoryStorage();
  const offlineStore = new LocalStorageOfflineTrainingStateStore(offlineStorage);
  const repository = new OfflineBufferedTrainingStateRepository(remote, offlineStore);
  return { remote, remoteDelegate, offlineStore, repository };
}

test("coalesces multiple offline session writes against one remote CAS revision", async () => {
  const { remote, remoteDelegate, offlineStore, repository } = fixture();

  const first = await repository.saveSession(key, session("online"), { expectedRevision: null });
  assert.equal(first.revision, 1);

  remote.failureMode = "unavailable";
  const offlineOne = await repository.saveSession(key, session("offline-one"), {
    expectedRevision: 1,
  });
  const offlineTwo = await repository.saveSession(key, session("offline-two"), {
    expectedRevision: 1,
  });
  assert.equal(offlineOne.revision, 1);
  assert.equal(offlineTwo.revision, 1);
  assert.equal((await remoteDelegate.loadSession(key))?.value.lastAction, "online");

  const afterRestart = new OfflineBufferedTrainingStateRepository(remote, offlineStore);
  const restoredOffline = await afterRestart.loadSession(key);
  assert.equal(restoredOffline?.revision, 1);
  assert.equal(restoredOffline?.value.lastAction, "offline-two");

  remote.failureMode = "available";
  const synced = await afterRestart.loadSession(key);
  assert.equal(synced?.revision, 2);
  assert.equal(synced?.value.lastAction, "offline-two");
  assert.equal((await remoteDelegate.loadSession(key))?.value.lastAction, "offline-two");
  assert.equal(remote.sessionSaveCalls, 2);
});

test("falls back to the last server-backed cache during a read-only outage", async () => {
  const { remote, repository } = fixture();

  await repository.saveSession(key, session("server-cache"), { expectedRevision: null });
  remote.failureMode = "unavailable";

  const cached = await repository.loadSession(key);
  assert.equal(cached?.revision, 1);
  assert.equal(cached?.value.lastAction, "server-cache");
});

test("discards stale offline session state when the server revision changed", async () => {
  const { remote, remoteDelegate, repository } = fixture();

  await repository.saveSession(key, session("revision-one"), { expectedRevision: null });
  remote.failureMode = "unavailable";
  await repository.saveSession(key, session("offline-candidate"), { expectedRevision: 1 });

  remote.failureMode = "available";
  await remoteDelegate.saveSession(key, session("other-device"), { expectedRevision: 1 });

  await assert.rejects(
    repository.saveSession(key, session("offline-newest"), { expectedRevision: 1 }),
    (error: unknown) => {
      assert.ok(error instanceof TrainingStateConflictError);
      assert.equal(error.expectedRevision, 1);
      assert.equal(error.actualRevision, 2);
      return true;
    },
  );

  const authoritative = await repository.loadSession(key);
  assert.equal(authoritative?.revision, 2);
  assert.equal(authoritative?.value.lastAction, "other-device");
});

test("buffers and later applies an offline runtime deletion", async () => {
  const { remote, remoteDelegate, offlineStore, repository } = fixture();
  const runtimeId = "vscode-sim";

  const first = await repository.saveRuntimeSnapshot(
    key,
    runtimeId,
    { branch: "feature/online" },
    { expectedRevision: null },
  );
  assert.equal(first.revision, 1);

  remote.failureMode = "unavailable";
  await repository.deleteRuntimeSnapshot(key, runtimeId, { expectedRevision: 1 });
  assert.equal(await repository.loadRuntimeSnapshot(key, runtimeId), null);
  assert.deepEqual((await remoteDelegate.loadRuntimeSnapshot(key, runtimeId))?.value, {
    branch: "feature/online",
  });

  const afterRestart = new OfflineBufferedTrainingStateRepository(remote, offlineStore);
  remote.failureMode = "available";
  assert.equal(await afterRestart.loadRuntimeSnapshot(key, runtimeId), null);
  assert.equal(await remoteDelegate.loadRuntimeSnapshot(key, runtimeId), null);
  assert.equal(remote.runtimeDeleteCalls, 1);
});

test("does not hide authorization or other non-transport failures behind the offline buffer", async () => {
  const { remote, offlineStore, repository } = fixture();
  remote.failureMode = "generic";

  await assert.rejects(
    repository.saveSession(key, session("must-not-buffer"), { expectedRevision: null }),
    /Not authorized/,
  );
  assert.equal(offlineStore.loadSession(key), null);
});
