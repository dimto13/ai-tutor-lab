import assert from "node:assert/strict";
import test from "node:test";
import { createTrainingSession, recordLastAction } from "@ai-train-lab/training-engine";
import type {
  Scenario,
  TrainingStateKey,
  TrainingStateRepository,
} from "@ai-train-lab/training-engine";
import { MigratingTrainingStateRepository } from "../src/persistence/migratingTrainingStateRepository.ts";
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

const scenario: Scenario = {
  id: "migration.guided",
  mode: "guided",
  title: "Migration",
  description: "Migration fixture",
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
  subject: { userId: "user-sub", tenantId: null },
  scenarioId: scenario.id,
  mode: "guided",
};

function repositories() {
  const local = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const remote = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const migrating = new MigratingTrainingStateRepository(remote, local);
  return { local, remote, migrating };
}

test("local session is exposed as migration revision zero and created remotely on first write", async () => {
  const { local, remote, migrating } = repositories();
  const localSession = recordLastAction(
    createTrainingSession(scenario, scenario.id, 100, key.subject),
    "owned-local-state",
  );
  await local.saveSession(key, localSession, { expectedRevision: null, updatedAt: 101 });

  const candidate = await migrating.loadSession(key);
  assert.equal(candidate?.revision, 0);
  assert.equal(candidate?.value.lastAction, "owned-local-state");

  const saved = await migrating.saveSession(key, localSession, { expectedRevision: 0 });
  assert.equal(saved.revision, 1);
  assert.equal((await remote.loadSession(key))?.value.lastAction, "owned-local-state");
});

test("existing remote session always wins over a different browser migration candidate", async () => {
  const { local, remote, migrating } = repositories();
  const initial = createTrainingSession(scenario, scenario.id, 200, key.subject);
  await local.saveSession(key, recordLastAction(initial, "local"), { expectedRevision: null });
  await remote.saveSession(key, recordLastAction(initial, "remote"), { expectedRevision: null });

  const loaded = await migrating.loadSession(key);
  assert.equal(loaded?.revision, 1);
  assert.equal(loaded?.value.lastAction, "remote");
});

test("remote read failures are not hidden by a stale local session", async () => {
  const local = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const localSession = createTrainingSession(scenario, scenario.id, 300, key.subject);
  await local.saveSession(key, localSession, { expectedRevision: null });

  const unavailableRemote: TrainingStateRepository = {
    async loadSession() {
      throw new Error("remote unavailable");
    },
    async saveSession() {
      throw new Error("unused");
    },
    async loadRuntimeSnapshot() {
      throw new Error("unused");
    },
    async saveRuntimeSnapshot() {
      throw new Error("unused");
    },
    async deleteRuntimeSnapshot() {
      throw new Error("unused");
    },
  };

  const migrating = new MigratingTrainingStateRepository(unavailableRemote, local);
  await assert.rejects(migrating.loadSession(key), /remote unavailable/);
});

test("owned local runtime snapshot is copied to an empty remote repository on load", async () => {
  const { local, remote, migrating } = repositories();
  await local.saveRuntimeSnapshot(key, "vscode-sim", { files: ["notiz.txt"] }, {
    expectedRevision: null,
  });

  const migrated = await migrating.loadRuntimeSnapshot(key, "vscode-sim");
  assert.equal(migrated?.revision, 1);
  assert.deepEqual(migrated?.value, { files: ["notiz.txt"] });
  assert.deepEqual((await remote.loadRuntimeSnapshot(key, "vscode-sim"))?.value, {
    files: ["notiz.txt"],
  });
});
