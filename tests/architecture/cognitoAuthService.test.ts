import assert from "node:assert/strict";
import test from "node:test";

import { createCognitoAuthService } from "../../apps/web/src/auth/adapters/cognitoAuthService.ts";
import type { CognitoAuthClient } from "../../apps/web/src/auth/adapters/awsCognitoClient.ts";

function createFakeClient(overrides: Partial<CognitoAuthClient> = {}): CognitoAuthClient {
  return {
    async getSession() {
      return {
        userId: "cognito-user-1",
        tenantId: "tenant-1",
        email: "learner@example.test",
        displayName: "Learner One",
        roles: ["learner"],
        accessToken: "access-token",
        expiresAt: "2026-08-11T18:00:00.000Z",
      };
    },
    async signInWithPassword() {
      return "done";
    },
    async signInWithOidc() {},
    async signOut() {},
    ...overrides,
  };
}

test("Cognito adapter normalizes the provider session to AuthSession", async () => {
  const auth = createCognitoAuthService(createFakeClient());

  assert.deepEqual(await auth.getSession(), {
    identity: {
      userId: "cognito-user-1",
      tenantId: "tenant-1",
      email: "learner@example.test",
      displayName: "Learner One",
      roles: ["learner"],
    },
    accessToken: "access-token",
    expiresAt: "2026-08-11T18:00:00.000Z",
  });
});

test("Cognito password sign-in returns the normalized authenticated session", async () => {
  let credentials: [string, string] | null = null;
  const client = createFakeClient({
    async signInWithPassword(identifier, password) {
      credentials = [identifier, password];
      return "done";
    },
  });
  const auth = createCognitoAuthService(client);

  const result = await auth.signIn({
    method: "password",
    identifier: "learner@example.test",
    password: "secret",
  });

  assert.deepEqual(credentials, ["learner@example.test", "secret"]);
  assert.equal(result.status, "authenticated");
  if (result.status === "authenticated") {
    assert.equal(result.session.identity.userId, "cognito-user-1");
  }
});

test("Cognito OIDC sign-in stays provider-neutral above the adapter", async () => {
  let providerId: string | null = null;
  const client = createFakeClient({
    async signInWithOidc(value) {
      providerId = value;
    },
  });
  const auth = createCognitoAuthService(client);

  const result = await auth.signIn({ method: "oidc", providerId: "enterprise-oidc" });

  assert.equal(providerId, "enterprise-oidc");
  assert.deepEqual(result, { status: "redirecting" });
});

test("Cognito adapter rejects unsupported additional sign-in steps", async () => {
  const client = createFakeClient({
    async signInWithPassword() {
      return "requires_action";
    },
  });
  const auth = createCognitoAuthService(client);

  await assert.rejects(
    auth.signIn({
      method: "password",
      identifier: "learner@example.test",
      password: "secret",
    }),
    /additional verification step/,
  );
});
