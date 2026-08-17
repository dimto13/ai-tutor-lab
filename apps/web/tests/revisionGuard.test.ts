import assert from "node:assert/strict";
import test from "node:test";
import { expectedRevisionForWrite, type RevisionLoadStatus } from "../src/profile/revisionGuard.ts";

const notLoaded = "Noch nicht geladen.";

test("a loaded record writes against its own revision", () => {
  assert.equal(expectedRevisionForWrite("ready", { revision: 7 }, notLoaded), 7);
});

test("a loaded but absent record keeps the create guard", () => {
  assert.equal(expectedRevisionForWrite("ready", null, notLoaded), null);
});

test("an unloaded state never yields the create guard", () => {
  const unloaded: RevisionLoadStatus[] = ["idle", "loading", "error"];

  for (const status of unloaded) {
    assert.throws(
      () => expectedRevisionForWrite(status, null, notLoaded),
      new RegExp(notLoaded),
      `status ${status} must not be writable`,
    );
  }
});

test("an unloaded state does not write even when a stale record is still held", () => {
  assert.throws(
    () => expectedRevisionForWrite("loading", { revision: 3 }, notLoaded),
    new RegExp(notLoaded),
  );
});
