import assert from "node:assert/strict";
import test from "node:test";
import { TrainingStateConflictError, createTrainingSession } from "@ai-train-lab/training-engine";
import type { Scenario, TrainingStateKey } from "@ai-train-lab/training-engine";
import {
  LocalStorageTrainingStateRepository,
  runtimeSnapshotStorageKey,
  trainingSessionStorageKey,
} from "../src/state/localStorageTrainingStateRepository.ts";
import type { StorageLike } from "../src/state/localStorageTrainingStateRepository.ts";

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
  id: "repo-contract.guided",
  mode: "guided",
  title: "Repository contract",
  description: "Persistence contract fixture",
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

function key(userId = "alice", tenantId: string | null = "tenant-a"): TrainingStateKey {
  return {
    subject: { userId, tenantId },
    scenarioId: scenario.id,
    mode: "guided",
  };
}

function legacySubjectKey(stateKey: TrainingStateKey): string {
  const tenantKey =
    stateKey.subject.tenantId === null
      ? "tenant:none"
      : `tenant:value:${encodeURIComponent(stateKey.subject.tenantId)}`;
  return `${tenantKey}:user:${encodeURIComponent(stateKey.subject.userId)}`;
}

test("session writes are versioned and reject stale revisions", async () => {
  const storage = new MemoryStorage();
  const repository = new LocalStorageTrainingStateRepository(storage);
  const stateKey = key();
  const session = createTrainingSession(scenario, scenario.id, 100, stateKey.subject);

  const first = await repository.saveSession(stateKey, session, {
    expectedRevision: null,
    updatedAt: 101,
  });
  assert.equal(first.revision, 1);
  assert.equal(first.updatedAt, 101);
  assert.deepEqual((await repository.loadSession(stateKey))?.value, session);

  await assert.rejects(
    repository.saveSession(stateKey, session, { expectedRevision: null }),
    (error: unknown) => {
      assert.ok(error instanceof TrainingStateConflictError);
      assert.equal(error.expectedRevision, null);
      assert.equal(error.actualRevision, 1);
      return true;
    },
  );

  const second = await repository.saveSession(stateKey, session, {
    expectedRevision: 1,
    updatedAt: 102,
  });
  assert.equal(second.revision, 2);
});

test("legacy v3 sessions load as revision zero and migrate on first write", async () => {
  const storage = new MemoryStorage();
  const repository = new LocalStorageTrainingStateRepository(storage);
  const stateKey = key();
  const session = createTrainingSession(scenario, scenario.id, 200, stateKey.subject);
  const legacyKey = `ai-training-lab:${legacySubjectKey(stateKey)}:${scenario.id}:v3`;
  storage.setItem(legacyKey, JSON.stringify(session));

  const legacy = await repository.loadSession(stateKey);
  assert.equal(legacy?.revision, 0);
  assert.deepEqual(legacy?.value, session);

  const migrated = await repository.saveSession(stateKey, session, {
    expectedRevision: 0,
    updatedAt: 201,
  });
  assert.equal(migrated.revision, 1);
  assert.equal(storage.getItem(legacyKey), null);
  assert.notEqual(storage.getItem(trainingSessionStorageKey(stateKey)), null);
});

test("session ownership and tenant boundaries are enforced by key and payload", async () => {
  const storage = new MemoryStorage();
  const repository = new LocalStorageTrainingStateRepository(storage);
  const aliceKey = key("alice", "tenant-a");
  const bobKey = key("bob", "tenant-a");
  const otherTenantKey = key("alice", "tenant-b");
  const aliceSession = createTrainingSession(scenario, scenario.id, 300, aliceKey.subject);

  await repository.saveSession(aliceKey, aliceSession, { expectedRevision: null });
  assert.equal(await repository.loadSession(bobKey), null);
  assert.equal(await repository.loadSession(otherTenantKey), null);

  await assert.rejects(
    repository.saveSession(bobKey, aliceSession, { expectedRevision: null }),
    /does not match persistence key/,
  );
});

test("runtime snapshots share revision semantics and migrate legacy v2 values", async () => {
  const storage = new MemoryStorage();
  const repository = new LocalStorageTrainingStateRepository(storage);
  const stateKey = key();
  const runtimeId = "vscode-sim";
  const legacyKey = `ai-training-lab:${legacySubjectKey(stateKey)}:${scenario.id}:runtime:${runtimeId}:v2`;
  storage.setItem(legacyKey, JSON.stringify({ files: ["a.txt"] }));

  const legacy = await repository.loadRuntimeSnapshot(stateKey, runtimeId);
  assert.equal(legacy?.revision, 0);
  assert.deepEqual(legacy?.value, { files: ["a.txt"] });

  const migrated = await repository.saveRuntimeSnapshot(
    stateKey,
    runtimeId,
    { files: ["a.txt", "b.txt"] },
    { expectedRevision: 0, updatedAt: 401 },
  );
  assert.equal(migrated.revision, 1);
  assert.equal(storage.getItem(legacyKey), null);
  assert.notEqual(storage.getItem(runtimeSnapshotStorageKey(stateKey, runtimeId)), null);

  await repository.deleteRuntimeSnapshot(stateKey, runtimeId);
  assert.equal(storage.getItem(runtimeSnapshotStorageKey(stateKey, runtimeId)), null);
});
