import assert from "node:assert/strict";
import test from "node:test";
import { createTrainingSession, recordLastAction } from "@ai-train-lab/training-engine";
import type { Scenario, TrainingStateKey } from "@ai-train-lab/training-engine";
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
