import assert from "node:assert/strict";
import test from "node:test";
import { createTrainingSession, recordLastAction } from "@ai-train-lab/training-engine";
import type {
  Scenario,
  TrainingStateKey,
  TrainingStateRepository,
} from "@ai-train-lab/training-engine";
import { OfflineBufferedTrainingStateRepository } from "../src/persistence/offlineBufferedTrainingStateRepository.ts";
import { LocalStorageTrainingStateSyncMetadataStore } from "../src/persistence/trainingStateSyncMetadata.ts";
import {
  LocalStorageTrainingStateRepository,
  type StorageLike,
} from "../src/state/localStorageTrainingStateRepository.ts";

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

class ToggleRemoteRepository implements TrainingStateRepository {
  online = true;

  constructor(private readonly delegate: TrainingStateRepository) {}

  private assertOnline() {
    if (!this.online) throw new Error("remote unavailable");
  }

  async loadSession(key: TrainingStateKey) {
    this.assertOnline();
    return this.delegate.loadSession(key);
  }

  async saveSession(
    key: Parameters<TrainingStateRepository["saveSession"]>[0],
    session: Parameters<TrainingStateRepository["saveSession"]>[1],
    options: Parameters<TrainingStateRepository["saveSession"]>[2],
  ) {
    this.assertOnline();
    return this.delegate.saveSession(key, session, options);
  }

  async loadRuntimeSnapshot(key: TrainingStateKey, runtimeId: string) {
    this.assertOnline();
    return this.delegate.loadRuntimeSnapshot(key, runtimeId);
  }

  async saveRuntimeSnapshot(
    key: Parameters<TrainingStateRepository["saveRuntimeSnapshot"]>[0],
    runtimeId: Parameters<TrainingStateRepository["saveRuntimeSnapshot"]>[1],
    snapshot: Parameters<TrainingStateRepository["saveRuntimeSnapshot"]>[2],
    options: Parameters<TrainingStateRepository["saveRuntimeSnapshot"]>[3],
  ) {
    this.assertOnline();
    return this.delegate.saveRuntimeSnapshot(key, runtimeId, snapshot, options);
  }

  async deleteRuntimeSnapshot(key: TrainingStateKey, runtimeId: string) {
    this.assertOnline();
    return this.delegate.deleteRuntimeSnapshot(key, runtimeId);
  }
}

const scenario: Scenario = {
  id: "offline-sync.guided",
  mode: "guided",
  title: "Offline sync",
  description: "Offline synchronization fixture",
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
  subject: { userId: "alice-sub", tenantId: "tenant-a" },
  scenarioId: scenario.id,
  mode: "guided",
};

function fixture() {
  const localStorage = new MemoryStorage();
  const remoteStorage = new MemoryStorage();
  const local = new LocalStorageTrainingStateRepository(localStorage);
  const remoteDelegate = new LocalStorageTrainingStateRepository(remoteStorage);
  const remote = new ToggleRemoteRepository(remoteDelegate);
  const metadata = new LocalStorageTrainingStateSyncMetadataStore(localStorage);
  const repository = new OfflineBufferedTrainingStateRepository(remote, local, metadata);
  return { local, remote, remoteDelegate, metadata, repository };
}

async function seedRemote(
  remote: LocalStorageTrainingStateRepository,
  action = "server-base",
) {
  const session = recordLastAction(
    createTrainingSession(scenario, scenario.id, 100, key.subject),
    action,
  );
  return remote.saveSession(key, session, { expectedRevision: null, updatedAt: 101 });
}

test("cached server session remains available while remote is offline", async () => {
  const { remote, remoteDelegate, repository } = fixture();
  await seedRemote(remoteDelegate);

  const online = await repository.loadSession(key);
  assert.equal(online?.value.lastAction, "server-base");

  remote.online = false;
  const offline = await repository.loadSession(key);
  assert.equal(offline?.value.lastAction, "server-base");
  assert.equal(offline?.revision, online?.revision);
});

test("offline session changes sync when the remote base revision is unchanged", async () => {
  const { remote, remoteDelegate, metadata, repository } = fixture();
  await seedRemote(remoteDelegate);
  const cached = await repository.loadSession(key);
  assert.ok(cached);

  remote.online = false;
  const offlineSession = recordLastAction(cached.value as ReturnType<typeof createTrainingSession>, "offline");
  const offline = await repository.saveSession(key, offlineSession, {
    expectedRevision: cached.revision,
  });
  assert.equal(offline.value.lastAction, "offline");
  assert.equal(metadata.loadSession(key)?.dirty, true);

  remote.online = true;
  const synchronized = await repository.loadSession(key);
  assert.equal(synchronized?.value.lastAction, "offline");
  assert.equal((await remoteDelegate.loadSession(key))?.value.lastAction, "offline");
  assert.equal((await remoteDelegate.loadSession(key))?.revision, 2);
  assert.deepEqual(metadata.loadSession(key), {
    version: 1,
    remoteKnown: true,
    remoteRevision: 2,
    dirty: false,
    pendingDelete: false,
    lastSyncedAt: metadata.loadSession(key)?.lastSyncedAt ?? null,
  });
});

test("remote session wins when it changed while this device was offline", async () => {
  const { remote, remoteDelegate, repository } = fixture();
  const seeded = await seedRemote(remoteDelegate);
  const cached = await repository.loadSession(key);
  assert.ok(cached);

  remote.online = false;
  const offlineSession = recordLastAction(cached.value as ReturnType<typeof createTrainingSession>, "offline");
  await repository.saveSession(key, offlineSession, { expectedRevision: cached.revision });

  await remoteDelegate.saveSession(
    key,
    recordLastAction(seeded.value as ReturnType<typeof createTrainingSession>, "other-device"),
    { expectedRevision: seeded.revision },
  );

  remote.online = true;
  const reconciled = await repository.loadSession(key);
  assert.equal(reconciled?.value.lastAction, "other-device");
  assert.equal((await remoteDelegate.loadSession(key))?.value.lastAction, "other-device");
});

test("offline runtime snapshot changes sync against the last known remote revision", async () => {
  const { remote, remoteDelegate, repository } = fixture();
  await remoteDelegate.saveRuntimeSnapshot(key, "vscode-sim", { files: ["base.txt"] }, {
    expectedRevision: null,
  });
  const cached = await repository.loadRuntimeSnapshot(key, "vscode-sim");
  assert.ok(cached);

  remote.online = false;
  await repository.saveRuntimeSnapshot(key, "vscode-sim", { files: ["offline.txt"] }, {
    expectedRevision: cached.revision,
  });

  remote.online = true;
  const synchronized = await repository.loadRuntimeSnapshot(key, "vscode-sim");
  assert.deepEqual(synchronized?.value, { files: ["offline.txt"] });
  assert.deepEqual((await remoteDelegate.loadRuntimeSnapshot(key, "vscode-sim"))?.value, {
    files: ["offline.txt"],
  });
});

test("pending offline runtime deletion is cancelled when server state changed", async () => {
  const { remote, remoteDelegate, metadata, repository } = fixture();
  const seeded = await remoteDelegate.saveRuntimeSnapshot(
    key,
    "vscode-sim",
    { files: ["base.txt"] },
    { expectedRevision: null },
  );
  await repository.loadRuntimeSnapshot(key, "vscode-sim");

  remote.online = false;
  await repository.deleteRuntimeSnapshot(key, "vscode-sim");
  assert.equal(metadata.loadRuntime(key, "vscode-sim")?.pendingDelete, true);

  await remoteDelegate.saveRuntimeSnapshot(
    key,
    "vscode-sim",
    { files: ["other-device.txt"] },
    { expectedRevision: seeded.revision },
  );

  remote.online = true;
  const reconciled = await repository.loadRuntimeSnapshot(key, "vscode-sim");
  assert.deepEqual(reconciled?.value, { files: ["other-device.txt"] });
  assert.equal(metadata.loadRuntime(key, "vscode-sim")?.pendingDelete, false);
});
