import { Amplify } from "aws-amplify";
import {
  confirmSignUp as amplifyConfirmSignUp,
  fetchAuthSession,
  fetchUserAttributes,
  resendSignUpCode as amplifyResendSignUpCode,
  signIn,
  signInWithRedirect,
  signOut,
  signUp as amplifySignUp,
} from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

export interface CognitoSessionSnapshot {
  userId: string;
  tenantId: string | null;
  email: string | null;
  displayName: string | null;
  roles: readonly string[];
  accessToken: string | null;
  expiresAt: string | null;
}

export type CognitoSignInOutcome = "done" | "confirm_sign_up" | "requires_action";

export type CognitoSignUpOutcome =
  | {
      status: "complete";
    }
  | {
      status: "confirmation_required";
      destination: string | null;
    }
  | {
      status: "requires_action";
    };

export interface CognitoAuthClient {
  getSession(forceRefresh?: boolean): Promise<CognitoSessionSnapshot | null>;
  signInWithPassword(identifier: string, password: string): Promise<CognitoSignInOutcome>;
  signInWithOidc(providerId: string): Promise<void>;
  signUpWithPassword(email: string, password: string): Promise<CognitoSignUpOutcome>;
  confirmSignUp(email: string, confirmationCode: string): Promise<"done" | "requires_action">;
  resendSignUpCode(email: string): Promise<string | null>;
  signOut(): Promise<void>;
}

export interface AmplifyCognitoClientOptions {
  outputsUrl?: string;
}

const OAUTH_CALLBACK_TIMEOUT_MS = 15_000;
const TENANT_GROUP_PREFIX = "tenant:";

function stringClaim(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArrayClaim(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function tenantIdFromGroups(groups: readonly string[], userId: string): string {
  let tenantId: string | null = null;

  for (const group of groups) {
    if (!group.startsWith(TENANT_GROUP_PREFIX)) continue;
    const candidate = group.slice(TENANT_GROUP_PREFIX.length);
    if (!candidate) throw new Error("Authenticated Cognito session has invalid tenant membership.");
    if (tenantId !== null && tenantId !== candidate) {
      throw new Error("Authenticated Cognito session has multiple tenant memberships.");
    }
    tenantId = candidate;
  }

  return tenantId ?? `personal:${userId}`;
}

function expirationIso(expiration: unknown): string | null {
  if (typeof expiration !== "number" || !Number.isFinite(expiration)) return null;
  return new Date(expiration * 1000).toISOString();
}

function isOauthRedirectCallback(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.has("state") && (params.has("code") || params.has("error"));
}

async function enableOauthListener(): Promise<void> {
  if (!isOauthRedirectCallback(window.location.search)) {
    await import("aws-amplify/auth/enable-oauth-listener");
    return;
  }

  let cancelHubListener: () => void = () => undefined;
  let timeoutId: number | null = null;

  const redirectCompletion = new Promise<void>((resolve, reject) => {
    const settle = (callback: () => void) => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      cancelHubListener();
      callback();
    };

    cancelHubListener = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signInWithRedirect") {
        settle(resolve);
        return;
      }

      if (payload.event === "signInWithRedirect_failure") {
        const detail = payload.data instanceof Error ? payload.data.message : "Unknown OAuth error";
        settle(() => reject(new Error(`OIDC sign-in failed: ${detail}`)));
      }
    });

    timeoutId = window.setTimeout(() => {
      settle(() => reject(new Error("Timed out while completing the OIDC sign-in redirect.")));
    }, OAUTH_CALLBACK_TIMEOUT_MS);
  });

  try {
    await import("aws-amplify/auth/enable-oauth-listener");
    await redirectCompletion;
  } catch (error) {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    cancelHubListener();
    throw error;
  }
}

export function createAmplifyCognitoClient(
  options: AmplifyCognitoClientOptions = {},
): CognitoAuthClient {
  const outputsUrl = options.outputsUrl ?? "/amplify_outputs.json";
  let configurationPromise: Promise<void> | null = null;

  const ensureConfigured = async () => {
    if (configurationPromise) return configurationPromise;

    configurationPromise = (async () => {
      if (typeof window === "undefined") {
        throw new Error("Cognito browser authentication cannot be configured during SSR.");
      }

      const response = await fetch(outputsUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Unable to load Amplify client configuration (HTTP ${response.status}).`);
      }

      const outputs = (await response.json()) as Parameters<typeof Amplify.configure>[0];
      Amplify.configure(outputs);
      await enableOauthListener();
    })().catch((error) => {
      configurationPromise = null;
      throw error;
    });

    return configurationPromise;
  };

  return {
    async getSession(forceRefresh = false) {
      await ensureConfigured();

      const session = await fetchAuthSession({ forceRefresh });
      if (!session.tokens) return null;

      const rawAttributes = await fetchUserAttributes();
      const attributes = rawAttributes as Record<string, string | undefined>;
      const idTokenPayload = session.tokens.idToken?.payload ?? {};
      const accessTokenPayload = session.tokens.accessToken.payload;
      const userId = stringClaim(idTokenPayload["sub"]) ?? stringClaim(accessTokenPayload["sub"]);
      if (!userId)
        throw new Error("Authenticated Cognito session has no stable subject identifier.");
      const roles = stringArrayClaim(idTokenPayload["cognito:groups"]);

      return {
        userId,
        tenantId: tenantIdFromGroups(roles, userId),
        email: attributes["email"] ?? stringClaim(idTokenPayload["email"]),
        displayName: attributes["name"] ?? stringClaim(idTokenPayload["name"]),
        roles,
        accessToken: session.tokens.accessToken.toString(),
        expiresAt: expirationIso(accessTokenPayload["exp"]),
      };
    },

    async signInWithPassword(identifier, password) {
      await ensureConfigured();
      const result = await signIn({ username: identifier, password });
      if (result.isSignedIn || result.nextStep.signInStep === "DONE") return "done";
      if (result.nextStep.signInStep === "CONFIRM_SIGN_UP") return "confirm_sign_up";
      return "requires_action";
    },

    async signInWithOidc(providerId) {
      await ensureConfigured();
      await signInWithRedirect({ provider: { custom: providerId } });
    },

    async signUpWithPassword(email, password) {
      await ensureConfigured();
      const result = await amplifySignUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
          },
        },
      });

      if (result.isSignUpComplete || result.nextStep.signUpStep === "DONE") {
        return { status: "complete" };
      }

      if (result.nextStep.signUpStep === "CONFIRM_SIGN_UP") {
        return {
          status: "confirmation_required",
          destination: result.nextStep.codeDeliveryDetails?.destination ?? null,
        };
      }

      return { status: "requires_action" };
    },

    async confirmSignUp(email, confirmationCode) {
      await ensureConfigured();
      const result = await amplifyConfirmSignUp({
        username: email,
        confirmationCode,
      });

      return result.isSignUpComplete || result.nextStep.signUpStep === "DONE"
        ? "done"
        : "requires_action";
    },

    async resendSignUpCode(email) {
      await ensureConfigured();
      const result = await amplifyResendSignUpCode({ username: email });
      return result.destination ?? null;
    },

    async signOut() {
      await ensureConfigured();
      await signOut();
    },
  };
}
