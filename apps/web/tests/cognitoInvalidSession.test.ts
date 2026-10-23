import assert from "node:assert/strict";
import test from "node:test";

import {
  createAmplifyCognitoClient,
  type AmplifyCognitoClientOptions,
  type CognitoAuthClient,
} from "../src/auth/adapters/awsCognitoClient.ts";
import { createCognitoAuthService } from "../src/auth/adapters/cognitoAuthService.ts";

type AuthApi = NonNullable<AmplifyCognitoClientOptions["authApi"]>;

function rejectedSession(): Error {
  return Object.assign(new Error("Access Token has been revoked"), {
    name: "NotAuthorizedException",
  });
}

function validTokens() {
  return {
    tokens: {
      idToken: { payload: { sub: "learner-1", email: "learner@example.test" } },
      accessToken: {
        payload: { sub: "learner-1", exp: 1_900_000_000 },
        toString: () => "test-token",
      },
    },
  };
}

test("a rejected GetUser clears the local Cognito session and allows same-browser sign-in (#573)", async () => {
  let rejected = true;
  let cleared = false;
  let signInCalls = 0;
  const client = createAmplifyCognitoClient({
    configure: async () => undefined,
    authApi: {
      fetchAuthSession: async () => validTokens(),
      fetchUserAttributes: async () => {
        if (rejected) {
          rejected = false;
          throw rejectedSession();
        }
        return { email: "learner@example.test" };
      },
      signOut: async () => {
        cleared = true;
      },
      signIn: async () => {
        signInCalls += 1;
        if (!cleared) {
          throw Object.assign(new Error("There is already a signed in user."), {
            name: "UserAlreadyAuthenticatedException",
          });
        }
        return { isSignedIn: true, nextStep: { signInStep: "DONE" } };
      },
    } as unknown as AuthApi,
  });

  assert.equal(await client.getSession(), null);
  assert.equal(cleared, true, "local sign-out must complete before a new sign-in");
  assert.equal(await client.signInWithPassword("learner@example.test", "password"), "done");
  assert.equal(signInCalls, 1);
  assert.equal((await client.getSession())?.userId, "learner-1");
});

test("a rejected forced token refresh also clears the local session", async () => {
  let cleared = 0;
  const client = createAmplifyCognitoClient({
    configure: async () => undefined,
    authApi: {
      fetchAuthSession: async () => {
        throw rejectedSession();
      },
      signOut: async () => {
        cleared += 1;
      },
    } as unknown as AuthApi,
  });

  assert.equal(await client.getSession(true), null);
  assert.equal(cleared, 1);
});

test("transient GetUser errors do not discard potentially valid tokens", async () => {
  let cleared = 0;
  const client = createAmplifyCognitoClient({
    configure: async () => undefined,
    authApi: {
      fetchAuthSession: async () => validTokens(),
      fetchUserAttributes: async () => {
        throw Object.assign(new Error("Service unavailable"), { name: "NetworkError" });
      },
      signOut: async () => {
        cleared += 1;
      },
    } as unknown as AuthApi,
  });

  await assert.rejects(client.getSession(), /Service unavailable/);
  assert.equal(cleared, 0);
});

test("direct sign-in retries once after forced validation clears revoked tokens", async () => {
  let signInCalls = 0;
  let signOutCalls = 0;
  const refreshFlags: boolean[] = [];
  const client = createAmplifyCognitoClient({
    configure: async () => undefined,
    authApi: {
      fetchAuthSession: async ({ forceRefresh } = {}) => {
        refreshFlags.push(Boolean(forceRefresh));
        return validTokens();
      },
      fetchUserAttributes: async () => {
        throw rejectedSession();
      },
      signOut: async () => {
        signOutCalls += 1;
      },
      signIn: async () => {
        signInCalls += 1;
        if (signInCalls === 1) {
          throw Object.assign(new Error("There is already a signed in user."), {
            name: "UserAlreadyAuthenticatedException",
          });
        }
        return { isSignedIn: true, nextStep: { signInStep: "DONE" } };
      },
    } as unknown as AuthApi,
  });

  assert.equal(await client.signInWithPassword("learner@example.test", "password"), "done");
  assert.deepEqual(refreshFlags, [true]);
  assert.equal(signOutCalls, 1);
  assert.equal(signInCalls, 2, "one bounded retry, never a loop");
});

test("direct sign-in preserves a valid existing session rather than signing it out", async () => {
  let signInCalls = 0;
  let signOutCalls = 0;
  const client = createAmplifyCognitoClient({
    configure: async () => undefined,
    authApi: {
      fetchAuthSession: async () => validTokens(),
      fetchUserAttributes: async () => ({ email: "learner@example.test" }),
      signOut: async () => {
        signOutCalls += 1;
      },
      signIn: async () => {
        signInCalls += 1;
        throw Object.assign(new Error("Already signed in"), {
          name: "UserAlreadyAuthenticatedException",
        });
      },
    } as unknown as AuthApi,
  });

  await assert.rejects(
    client.signInWithPassword("other@example.test", "password"),
    { name: "UserAlreadyAuthenticatedException" },
  );
  assert.equal(signInCalls, 1);
  assert.equal(signOutCalls, 0);
});

test("direct sign-in never clears a session when validation fails transiently", async () => {
  let signInCalls = 0;
  let signOutCalls = 0;
  const client = createAmplifyCognitoClient({
    configure: async () => undefined,
    authApi: {
      fetchAuthSession: async () => validTokens(),
      fetchUserAttributes: async () => {
        throw Object.assign(new Error("Temporary network failure"), { name: "NetworkError" });
      },
      signOut: async () => {
        signOutCalls += 1;
      },
      signIn: async () => {
        signInCalls += 1;
        throw Object.assign(new Error("Already signed in"), {
          name: "UserAlreadyAuthenticatedException",
        });
      },
    } as unknown as AuthApi,
  });

  await assert.rejects(
    client.signInWithPassword("learner@example.test", "password"),
    /Temporary network failure/,
  );
  assert.equal(signInCalls, 1);
  assert.equal(signOutCalls, 0);
});

test("failed local sign-out does not falsely report a recovered session", async () => {
  const client = createAmplifyCognitoClient({
    configure: async () => undefined,
    authApi: {
      fetchAuthSession: async () => validTokens(),
      fetchUserAttributes: async () => {
        throw rejectedSession();
      },
      signOut: async () => {
        throw new Error("Local storage unavailable");
      },
    } as unknown as AuthApi,
  });

  await assert.rejects(client.getSession(), /Local storage unavailable/);
});

test("injected Cognito configuration is cached across concurrent session checks", async () => {
  let configureCalls = 0;
  const client = createAmplifyCognitoClient({
    configure: async () => {
      configureCalls += 1;
    },
    authApi: {
      fetchAuthSession: async () => ({ tokens: undefined }),
    } as unknown as AuthApi,
  });

  assert.deepEqual(await Promise.all([client.getSession(), client.getSession()]), [null, null]);
  assert.equal(await client.getSession(), null);
  assert.equal(configureCalls, 1);
});

test("sign-in failures expose a neutral German message, not the Cognito provider text", async () => {
  const providerError = Object.assign(new Error("There is already a signed in user."), {
    name: "UserAlreadyAuthenticatedException",
  });
  const service = createCognitoAuthService({
    signInWithPassword: async () => {
      throw providerError;
    },
  } as unknown as CognitoAuthClient);

  await assert.rejects(
    service.signIn({
      method: "password",
      identifier: "learner@example.test",
      password: "password",
    }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("Anmeldung fehlgeschlagen") &&
      !error.message.includes("signed in user") &&
      error.cause === providerError,
  );
});
