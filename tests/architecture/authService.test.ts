import assert from "node:assert/strict";
import test from "node:test";

import { createLocalAuthService } from "../../apps/web/src/auth/localAuthService.ts";
import type { UserIdentity } from "../../apps/web/src/auth/authService.ts";

const identity: UserIdentity = {
  userId: "user-1",
  tenantId: "tenant-1",
  email: "user@example.test",
  displayName: "Test User",
  roles: ["learner"],
};

test("local auth adapter follows the cloud-neutral AuthService lifecycle", async () => {
  const auth = createLocalAuthService({ identity });

  assert.equal(await auth.getSession(), null);

  const result = await auth.signIn({
    method: "password",
    identifier: "user@example.test",
    password: "not-used-by-local-adapter",
  });

  assert.equal(result.status, "authenticated");
  if (result.status !== "authenticated") return;

  assert.deepEqual(result.session.identity, identity);
  assert.deepEqual(await auth.getSession(), result.session);

  await auth.signOut();
  assert.equal(await auth.getSession(), null);
});
