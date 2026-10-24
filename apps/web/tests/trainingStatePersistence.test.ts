import assert from "node:assert/strict";
import test from "node:test";
import {
  TrainingStateUnavailableError,
  createTrainingSession,
  recordLastAction,
} from "@ai-train-lab/training-engine";
import type {
  Scenario,
  TrainingStateKey,
  TrainingStateRepository,
} from "@ai-train-lab/training-engine";
import { LocalStorageTrainingStateRepository } from "../src/state/localStorageTrainingStateRepository.ts";
import type { StorageLike } from "../src/state/localStorageTrainingStateRepository.ts";
import { TrainingStatePersistence } from "../src/state/trainingStatePersistence.ts";

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

const scenario: Scenario = {
  id: "persistence-coordinator.guided",
  mode: "guided",
  title: "Persistence coordinator",
  description: "Coordinator fixture",
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

function coordinator(repository: LocalStorageTrainingStateRepository) {
  return new TrainingStatePersistence(repository, key, scenario);
}

test("serializes consecutive session writes without self-conflicts", async () => {
  const repository = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const persistence = coordinator(repository);
  const initial = (await persistence.loadSession()).session;
  const first = recordLastAction(initial, "first");
  const second = recordLastAction(first, "second");

  const results = await Promise.all([
    persistence.saveSession(first),
    persistence.saveSession(second),
  ]);

  assert.deepEqual(results, [null, null]);
  const stored = await repository.loadSession(key);
  assert.equal(stored?.revision, 2);
  assert.equal(stored?.value.lastAction, "second");
});

test("returns persisted authority instead of overwriting a concurrent session", async () => {
  const repository = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const firstClient = coordinator(repository);
  const secondClient = coordinator(repository);
  const firstInitial = (await firstClient.loadSession()).session;
  const secondInitial = (await secondClient.loadSession()).session;

  await firstClient.saveSession(recordLastAction(firstInitial, "first-client"));
  const authoritative = await secondClient.saveSession(
    recordLastAction(secondInitial, "second-client"),
  );

  assert.equal(authoritative?.lastAction, "first-client");
  const stored = await repository.loadSession(key);
  assert.equal(stored?.revision, 1);
  assert.equal(stored?.value.lastAction, "first-client");
});

test("serializes runtime snapshot writes per runtime", async () => {
  const repository = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const persistence = coordinator(repository);

  await Promise.all([
    persistence.saveRuntimeSnapshot("vscode-sim", { value: 1 }),
    persistence.saveRuntimeSnapshot("vscode-sim", { value: 2 }),
  ]);

  const stored = await repository.loadRuntimeSnapshot(key, "vscode-sim");
  assert.equal(stored?.revision, 2);
  assert.deepEqual(stored?.value, { value: 2 });
});

test("serializes runtime deletes behind queued writes", async () => {
  const repository = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const persistence = coordinator(repository);

  const save = persistence.saveRuntimeSnapshot("vscode-sim", { branch: "feature/queued" });
  const remove = persistence.deleteRuntimeSnapshot("vscode-sim");

  await Promise.all([save, remove]);
  assert.equal(await repository.loadRuntimeSnapshot(key, "vscode-sim"), null);
});

test("does not overwrite an existing runtime before the client restores it", async () => {
  const repository = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const firstClient = coordinator(repository);
  const secondClient = coordinator(repository);

  await firstClient.saveRuntimeSnapshot("vscode-sim", { branch: "feature/server" });
  await secondClient.saveRuntimeSnapshot("vscode-sim", { branch: "main" });

  let stored = await repository.loadRuntimeSnapshot(key, "vscode-sim");
  assert.equal(stored?.revision, 1);
  assert.deepEqual(stored?.value, { branch: "feature/server" });

  const restored = await secondClient.loadRuntimeSnapshot("vscode-sim");
  assert.deepEqual(restored, { branch: "feature/server" });

  await secondClient.saveRuntimeSnapshot("vscode-sim", { branch: "feature/client-after-restore" });
  stored = await repository.loadRuntimeSnapshot(key, "vscode-sim");
  assert.equal(stored?.revision, 2);
  assert.deepEqual(stored?.value, { branch: "feature/client-after-restore" });
});

// #606: A runtime restore may read an empty snapshot while the learner is already editing.
// A delayed response must not overwrite the revision or return an empty state after a newer
// mutation was persisted, or the UI can show the edited artifact while Guided progress rewinds.
test("a delayed empty runtime restore cannot rewind a newer artifact mutation (#606)", async () => {
  const server = new LocalStorageTrainingStateRepository(new MemoryStorage());
  let readCount = 0;
  let releaseRead: (() => void) | undefined;
  let signalReadStarted: (() => void) | undefined;
  const readStarted = new Promise<void>((resolve) => {
    signalReadStarted = resolve;
  });
  const delayedRepository: TrainingStateRepository = {
    loadSession: (stateKey) => server.loadSession(stateKey),
    saveSession: (stateKey, session, options) => server.saveSession(stateKey, session, options),
    loadRuntimeSnapshot: async (stateKey, runtimeId) => {
      // Capture the response *before* the hold, like a slow server request.
      const captured = await server.loadRuntimeSnapshot(stateKey, runtimeId);
      readCount += 1;
      if (readCount === 2) {
        await new Promise<void>((resolve) => {
          releaseRead = resolve;
          signalReadStarted?.();
        });
      }
      return captured;
    },
    saveRuntimeSnapshot: (stateKey, runtimeId, snapshot, options) =>
      server.saveRuntimeSnapshot(stateKey, runtimeId, snapshot, options),
    deleteRuntimeSnapshot: (stateKey, runtimeId, options) =>
      server.deleteRuntimeSnapshot(stateKey, runtimeId, options),
  };
  const persistence = new TrainingStatePersistence(delayedRepository, key, scenario);
  const runtimeId = "artifact-preview";
  const applied = {
    appliedRevisionIds: ["summary-page-v2"],
    verifiedIds: ["summary-page"],
  };

  // A Guided attempt is already in progress when the panel begins restoration.
  const initialSession = (await persistence.loadSession()).session;
  const inProgress = recordLastAction(initialSession, "artifact.updated");
  assert.equal(await persistence.saveSession(inProgress), null);

  assert.equal(await persistence.loadRuntimeSnapshot(runtimeId), null);
  const pendingRestore = persistence.loadRuntimeSnapshot(runtimeId);
  await readStarted;

  // The mutation arrives while the older empty snapshot response is held.
  await persistence.saveRuntimeSnapshot(runtimeId, applied);
  assert.deepEqual((await server.loadRuntimeSnapshot(key, runtimeId))?.value, applied);
  const persistedSession = (await server.loadSession(key))?.value;
  assert.equal(persistedSession?.activeStepId, inProgress.activeStepId);
  assert.equal(persistedSession?.finishedAt, null);
  assert.equal(
    Object.values(persistedSession?.statuses ?? {}).filter((status) => status === "COMPLETED")
      .length,
    0,
  );
  if (!releaseRead) throw new Error("Delayed runtime read was not captured");
  releaseRead();

  // The original red regression must now observe the newer durable snapshot,
  // not the delayed empty response captured before the mutation.
  assert.deepEqual(
    await pendingRestore,
    applied,
    "late runtime restore must not report missing state after a newer local mutation",
  );
});

// #606: Sustained mutations invalidate every in-flight read. The coordinator must
// terminate without returning an old snapshot, then recover once writes settle.
test("a runtime restore fails closed after sustained concurrent mutations (#606)", async () => {
  const server = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const runtimeId = "artifact-preview";
  let injectMutations = false;
  let mutations = 0;
  const racingRepository: TrainingStateRepository = {
    loadSession: (stateKey) => server.loadSession(stateKey),
    saveSession: (stateKey, session, options) => server.saveSession(stateKey, session, options),
    loadRuntimeSnapshot: async (stateKey, id) => {
      // Capture the stale response before the concurrent durable write.
      const captured = await server.loadRuntimeSnapshot(stateKey, id);
      if (injectMutations && id === runtimeId && mutations < 5) {
        mutations += 1;
        await persistence.saveRuntimeSnapshot(id, { version: mutations });
      }
      return captured;
    },
    saveRuntimeSnapshot: (stateKey, id, snapshot, options) =>
      server.saveRuntimeSnapshot(stateKey, id, snapshot, options),
    deleteRuntimeSnapshot: (stateKey, id, options) =>
      server.deleteRuntimeSnapshot(stateKey, id, options),
  };
  const persistence = new TrainingStatePersistence(racingRepository, key, scenario);
  assert.equal(await persistence.loadRuntimeSnapshot(runtimeId), null);
  injectMutations = true;

  await assert.rejects(
    persistence.loadRuntimeSnapshot(runtimeId),
    /Runtime snapshot changed during restore; retry after mutations settle/,
  );
  assert.equal(mutations, 5, "the restore must stop after five invalidated reads");
  assert.deepEqual((await server.loadRuntimeSnapshot(key, runtimeId))?.value, { version: 5 });

  // A rejected read must not poison the coordinator's revision cache or write chain.
  assert.deepEqual(await persistence.loadRuntimeSnapshot(runtimeId), { version: 5 });
  await persistence.saveRuntimeSnapshot(runtimeId, { version: 6 });
  assert.deepEqual((await server.loadRuntimeSnapshot(key, runtimeId))?.value, { version: 6 });
});

test("blocks stale reconnect writes until the runtime reloads authoritative state", async () => {
  const repository = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const firstClient = coordinator(repository);
  const secondClient = coordinator(repository);

  await firstClient.saveRuntimeSnapshot("vscode-sim", { branch: "main" });
  assert.deepEqual(await secondClient.loadRuntimeSnapshot("vscode-sim"), { branch: "main" });

  await firstClient.saveRuntimeSnapshot("vscode-sim", { branch: "feature/server-newer" });
  await secondClient.saveRuntimeSnapshot("vscode-sim", { branch: "feature/stale-offline" });
  await secondClient.saveRuntimeSnapshot("vscode-sim", { branch: "feature/still-stale" });

  let stored = await repository.loadRuntimeSnapshot(key, "vscode-sim");
  assert.equal(stored?.revision, 2);
  assert.deepEqual(stored?.value, { branch: "feature/server-newer" });

  const restored = await secondClient.loadRuntimeSnapshot("vscode-sim");
  assert.deepEqual(restored, { branch: "feature/server-newer" });

  await secondClient.saveRuntimeSnapshot("vscode-sim", { branch: "feature/after-resync" });
  stored = await repository.loadRuntimeSnapshot(key, "vscode-sim");
  assert.equal(stored?.revision, 3);
  assert.deepEqual(stored?.value, { branch: "feature/after-resync" });
});

test("blocks stale runtime delete until authoritative state was restored", async () => {
  const repository = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const firstClient = coordinator(repository);
  const secondClient = coordinator(repository);

  await firstClient.saveRuntimeSnapshot("vscode-sim", { branch: "main" });
  assert.deepEqual(await secondClient.loadRuntimeSnapshot("vscode-sim"), { branch: "main" });

  await firstClient.saveRuntimeSnapshot("vscode-sim", { branch: "feature/server-newer" });
  await secondClient.saveRuntimeSnapshot("vscode-sim", { branch: "feature/stale-offline" });

  await assert.rejects(
    secondClient.deleteRuntimeSnapshot("vscode-sim"),
    /must be restored before it can be deleted/,
  );
  assert.deepEqual((await repository.loadRuntimeSnapshot(key, "vscode-sim"))?.value, {
    branch: "feature/server-newer",
  });

  assert.deepEqual(await secondClient.loadRuntimeSnapshot("vscode-sim"), {
    branch: "feature/server-newer",
  });
  await secondClient.deleteRuntimeSnapshot("vscode-sim");
  assert.equal(await repository.loadRuntimeSnapshot(key, "vscode-sim"), null);
});

test("loads the latest session after queued writes complete", async () => {
  const repository = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const persistence = coordinator(repository);
  const initial = createTrainingSession(scenario, scenario.id, 100, key.subject);

  const write = persistence.saveSession(recordLastAction(initial, "queued"));
  const loaded = persistence.loadSession();

  await write;
  assert.equal((await loaded).session.lastAction, "queued");
});

test("a failed authoritative write for a finished training reaches the caller", async () => {
  // #467 makes the offline buffer fail closed for completed sessions. That signal is only useful
  // if the coordinator propagates it instead of resolving as if the write had landed.
  const repository = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const persistence = coordinator(repository);
  const initial = (await persistence.loadSession()).session;
  const finished = { ...initial, finishedAt: 1_700_000_000_000 };

  const unavailable = new TrainingStateUnavailableError(new Error("Failed to fetch"));
  const failing = new TrainingStatePersistence(
    {
      loadSession: async () => null,
      saveSession: async () => {
        throw unavailable;
      },
      loadRuntimeSnapshot: async () => null,
      saveRuntimeSnapshot: async () => {
        throw unavailable;
      },
      deleteRuntimeSnapshot: async () => {
        throw unavailable;
      },
    },
    key,
    scenario,
  );

  await assert.rejects(failing.saveSession(finished), TrainingStateUnavailableError);

  // The serialized write chain stays usable after the rejection.
  await assert.rejects(failing.saveSession(finished), TrainingStateUnavailableError);
  assert.equal((await persistence.loadSession()).session.finishedAt, null);
});
