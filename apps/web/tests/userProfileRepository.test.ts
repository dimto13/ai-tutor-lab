import assert from "node:assert/strict";
import test from "node:test";
import {
  LocalUserProfileRepository,
  userProfileStorageKey,
  type UserProfileStorageLike,
} from "../src/persistence/adapters/localUserProfileRepository.ts";
import { UserProfileConflictError } from "../src/profile/userProfileRepository.ts";

class MemoryStorage implements UserProfileStorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const alice = { userId: "alice", tenantId: "tenant-a" } as const;

test("profile writes are scoped and revision protected", async () => {
  const storage = new MemoryStorage();
  const repository = new LocalUserProfileRepository(storage);

  const first = await repository.save(alice, { displayName: "Alice" }, null);
  assert.equal(first.displayName, "Alice");
  assert.equal(first.revision, 1);
  assert.equal((await repository.load(alice))?.displayName, "Alice");
  assert.notEqual(storage.getItem(userProfileStorageKey(alice)), null);

  await assert.rejects(
    repository.save(alice, { displayName: "Stale" }, null),
    (error: unknown) => {
      assert.ok(error instanceof UserProfileConflictError);
      assert.equal(error.expectedRevision, null);
      assert.equal(error.actualRevision, 1);
      return true;
    },
  );

  const second = await repository.save(alice, { displayName: "Alice Example" }, 1);
  assert.equal(second.displayName, "Alice Example");
  assert.equal(second.revision, 2);
});

test("profiles do not leak across users or tenants", async () => {
  const storage = new MemoryStorage();
  const repository = new LocalUserProfileRepository(storage);

  await repository.save(alice, { displayName: "Alice" }, null);

  assert.equal(await repository.load({ userId: "bob", tenantId: "tenant-a" }), null);
  assert.equal(await repository.load({ userId: "alice", tenantId: "tenant-b" }), null);
});

test("invalid stored profile records are ignored", async () => {
  const storage = new MemoryStorage();
  const repository = new LocalUserProfileRepository(storage);
  storage.setItem(userProfileStorageKey(alice), "{invalid-json");

  assert.equal(await repository.load(alice), null);
});
