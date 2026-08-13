import assert from "node:assert/strict";
import test from "node:test";
import {
  LocalUserPreferencesRepository,
  userPreferencesStorageKey,
  type UserPreferencesStorageLike,
} from "../src/persistence/adapters/localUserPreferencesRepository.ts";
import { UserPreferencesConflictError } from "../src/profile/userPreferencesRepository.ts";

class MemoryStorage implements UserPreferencesStorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const alice = { userId: "alice", tenantId: "tenant-a" } as const;
const baseValue = {
  language: "de",
  preferredTrainingMode: "guided" as const,
  weeklyGoalMinutes: 90,
  accessibility: { reducedMotion: true },
  selfAssessedAiLevel: "beginner" as const,
};

test("preferences persist the self-assessed AI level with revision protection", async () => {
  const storage = new MemoryStorage();
  const repository = new LocalUserPreferencesRepository(storage);

  const first = await repository.save(alice, baseValue, null);
  assert.equal(first.selfAssessedAiLevel, "beginner");
  assert.equal(first.revision, 1);
  assert.notEqual(storage.getItem(userPreferencesStorageKey(alice)), null);

  await assert.rejects(repository.save(alice, baseValue, null), (error: unknown) => {
    assert.ok(error instanceof UserPreferencesConflictError);
    assert.equal(error.expectedRevision, null);
    assert.equal(error.actualRevision, 1);
    return true;
  });

  const second = await repository.save(
    alice,
    { ...baseValue, selfAssessedAiLevel: "advanced" },
    first.revision,
  );
  assert.equal(second.selfAssessedAiLevel, "advanced");
  assert.equal(second.language, "de");
  assert.equal(second.weeklyGoalMinutes, 90);
  assert.deepEqual(second.accessibility, { reducedMotion: true });
  assert.equal(second.revision, 2);
});

test("preferences remain isolated by user and tenant", async () => {
  const storage = new MemoryStorage();
  const repository = new LocalUserPreferencesRepository(storage);

  await repository.save(alice, baseValue, null);

  assert.equal(await repository.load({ userId: "bob", tenantId: "tenant-a" }), null);
  assert.equal(await repository.load({ userId: "alice", tenantId: "tenant-b" }), null);
});

test("invalid self-assessed AI levels in local storage are ignored", async () => {
  const storage = new MemoryStorage();
  const repository = new LocalUserPreferencesRepository(storage);
  storage.setItem(
    userPreferencesStorageKey(alice),
    JSON.stringify({
      subject: alice,
      ...baseValue,
      selfAssessedAiLevel: "expert-plus",
      revision: 1,
      updatedAt: Date.now(),
    }),
  );

  assert.equal(await repository.load(alice), null);
});
