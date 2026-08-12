import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
    async signUpWithPassword() {
      return { status: "complete" };
    },
    async confirmSignUp() {
      return "done";
    },
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

test("Cognito adapter forces a provider session refresh", async () => {
  const refreshFlags: boolean[] = [];
  const client = createFakeClient({
    async getSession(forceRefresh = false) {
      refreshFlags.push(forceRefresh);
      return {
        userId: "cognito-user-1",
        tenantId: "tenant-1",
        email: "learner@example.test",
        displayName: "Learner One",
        roles: ["learner"],
        accessToken: forceRefresh ? "refreshed-token" : "access-token",
        expiresAt: "2026-08-11T19:00:00.000Z",
      };
    },
  });
  const auth = createCognitoAuthService(client);

  const refreshed = await auth.refreshSession();

  assert.deepEqual(refreshFlags, [true]);
  assert.equal(refreshed?.accessToken, "refreshed-token");
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

test("Cognito adapter maps email/password registration to a confirmation request", async () => {
  let credentials: [string, string] | null = null;
  const client = createFakeClient({
    async signUpWithPassword(email, password) {
      credentials = [email, password];
      return {
        status: "confirmation_required",
        destination: "l***@example.test",
      };
    },
  });
  const auth = createCognitoAuthService(client);

  const result = await auth.signUp({
    email: "learner@example.test",
    password: "secret",
  });

  assert.deepEqual(credentials, ["learner@example.test", "secret"]);
  assert.deepEqual(result, {
    status: "confirmation_required",
    email: "learner@example.test",
    destination: "l***@example.test",
  });
});

test("Cognito adapter confirms a registration without leaking provider types", async () => {
  let confirmation: [string, string] | null = null;
  const client = createFakeClient({
    async confirmSignUp(email, confirmationCode) {
      confirmation = [email, confirmationCode];
      return "done";
    },
  });
  const auth = createCognitoAuthService(client);

  await auth.confirmSignUp({
    email: "learner@example.test",
    confirmationCode: "123456",
  });

  assert.deepEqual(confirmation, ["learner@example.test", "123456"]);
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

test("Cognito adapter rejects unsupported additional registration steps", async () => {
  const client = createFakeClient({
    async signUpWithPassword() {
      return { status: "requires_action" };
    },
  });
  const auth = createCognitoAuthService(client);

  await assert.rejects(
    auth.signUp({ email: "learner@example.test", password: "secret" }),
    /additional verification step/,
  );
});

test("AWS Cognito client uses signed token identity for canonical user and tenant ids", async () => {
  const source = await readFile(
    new URL("../../apps/web/src/auth/adapters/awsCognitoClient.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /idTokenPayload\["sub"\]/);
  assert.match(source, /accessTokenPayload\["sub"\]/);
  assert.match(source, /idTokenPayload\["cognito:groups"\]/);
  assert.match(source, /TENANT_GROUP_PREFIX\s*=\s*"tenant:"/);
  assert.match(source, /`personal:\$\{userId\}`/);
  assert.doesNotMatch(source, /getCurrentUser/);
  assert.doesNotMatch(source, /user\.userId/);
  assert.doesNotMatch(source, /custom:tenant_id/);
});
