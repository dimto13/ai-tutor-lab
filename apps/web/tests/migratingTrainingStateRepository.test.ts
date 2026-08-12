import assert from "node:assert/strict";
import test from "node:test";
import {
  createTrainingSession,
  recordLastAction,
  restoreTrainingSession,
} from "@ai-train-lab/training-engine";
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
  subject: { userId: "user-sub", tenantId: "personal:user-sub" },
  scenarioId: scenario.id,
  mode: "guided",
};

const previousPersonalKey: TrainingStateKey = {
  ...key,
  subject: { userId: "user-sub", tenantId: null },
};

function repositories() {
  const local = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const remote = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const migrating = new MigratingTrainingStateRepository(remote, local);
  return { local, remote, migrating };
}

test("previous null-tenant personal session migrates into the same user's personal tenant", async () => {
  const { local, remote, migrating } = repositories();
  const legacySession = recordLastAction(
    createTrainingSession(scenario, scenario.id, 100, previousPersonalKey.subject),
    "owned-local-state",
  );
  await local.saveSession(previousPersonalKey, legacySession, {
    expectedRevision: null,
    updatedAt: 101,
  });

  const candidate = await migrating.loadSession(key);
  assert.equal(candidate?.revision, 0);
  assert.equal(candidate?.value.lastAction, "owned-local-state");
  assert.deepEqual(candidate?.value.subject, key.subject);

  const migratedSession = restoreTrainingSession(
    scenario,
    scenario.id,
    candidate?.value,
    102,
    key.subject,
  );
  const saved = await migrating.saveSession(key, migratedSession, { expectedRevision: 0 });
  assert.equal(saved.revision, 1);
  assert.equal((await remote.loadSession(key))?.value.lastAction, "owned-local-state");
});

test("existing remote session always wins over a different browser migration candidate", async () => {
  const { local, remote, migrating } = repositories();
  const legacyInitial = createTrainingSession(
    scenario,
    scenario.id,
    200,
    previousPersonalKey.subject,
  );
  const remoteInitial = createTrainingSession(scenario, scenario.id, 200, key.subject);
  await local.saveSession(previousPersonalKey, recordLastAction(legacyInitial, "local"), {
    expectedRevision: null,
  });
  await remote.saveSession(key, recordLastAction(remoteInitial, "remote"), {
    expectedRevision: null,
  });

  const loaded = await migrating.loadSession(key);
  assert.equal(loaded?.revision, 1);
  assert.equal(loaded?.value.lastAction, "remote");
});

test("remote read failures are not hidden by a stale local session", async () => {
  const local = new LocalStorageTrainingStateRepository(new MemoryStorage());
  const localSession = createTrainingSession(
    scenario,
    scenario.id,
    300,
    previousPersonalKey.subject,
  );
  await local.saveSession(previousPersonalKey, localSession, { expectedRevision: null });

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

test("previous personal runtime snapshot is copied to an empty remote repository on load", async () => {
  const { local, remote, migrating } = repositories();
  await local.saveRuntimeSnapshot(
    previousPersonalKey,
    "vscode-sim",
    { files: ["notiz.txt"] },
    {
      expectedRevision: null,
    },
  );

  const migrated = await migrating.loadRuntimeSnapshot(key, "vscode-sim");
  assert.equal(migrated?.revision, 1);
  assert.deepEqual(migrated?.value, { files: ["notiz.txt"] });
  assert.deepEqual((await remote.loadRuntimeSnapshot(key, "vscode-sim"))?.value, {
    files: ["notiz.txt"],
  });
});

test("null-tenant personal history is never adopted into a named tenant", async () => {
  const { local, migrating } = repositories();
  const legacySession = createTrainingSession(
    scenario,
    scenario.id,
    400,
    previousPersonalKey.subject,
  );
  await local.saveSession(previousPersonalKey, legacySession, { expectedRevision: null });

  const tenantKey: TrainingStateKey = {
    ...key,
    subject: { userId: key.subject.userId, tenantId: "tenant-a" },
  };

  assert.equal(await migrating.loadSession(tenantKey), null);
});
