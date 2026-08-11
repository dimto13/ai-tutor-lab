import { Amplify } from "aws-amplify";
import {
  fetchAuthSession,
  fetchUserAttributes,
  signIn,
  signInWithRedirect,
  signOut,
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

export interface CognitoAuthClient {
  getSession(forceRefresh?: boolean): Promise<CognitoSessionSnapshot | null>;
  signInWithPassword(identifier: string, password: string): Promise<"done" | "requires_action">;
  signInWithOidc(providerId: string): Promise<void>;
  signOut(): Promise<void>;
}

export interface AmplifyCognitoClientOptions {
  outputsUrl?: string;
}

const OAUTH_CALLBACK_TIMEOUT_MS = 15_000;

function stringClaim(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArrayClaim(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
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
    // Amplify documents this side-effect import for SSR/MPA callback pages. The
    // Hub listener is registered first so getSession cannot race the token exchange.
    await import("aws-amplify/auth/enable-oauth-listener");
    await redirectCompletion;
  } catch (error) {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    cancelHubListener();
    throw error;
  }
}

/**
 * Thin AWS SDK client. All Amplify/Cognito-specific types and claims terminate here.
 */
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

      return {
        // `sub` is Cognito's immutable subject identifier and is also what
        // AppSync exposes server-side for persistence authorization.
        userId,
        // Tenant membership must come from a server-controlled membership source.
        // Cognito profile attributes are deliberately not authoritative here.
        tenantId: null,
        email: attributes["email"] ?? stringClaim(idTokenPayload["email"]),
        displayName: attributes["name"] ?? stringClaim(idTokenPayload["name"]),
        roles: stringArrayClaim(idTokenPayload["cognito:groups"]),
        accessToken: session.tokens.accessToken.toString(),
        expiresAt: expirationIso(accessTokenPayload["exp"]),
      };
    },

    async signInWithPassword(identifier, password) {
      await ensureConfigured();
      const result = await signIn({ username: identifier, password });
      return result.isSignedIn || result.nextStep.signInStep === "DONE"
        ? "done"
        : "requires_action";
    },

    async signInWithOidc(providerId) {
      await ensureConfigured();
      await signInWithRedirect({ provider: { custom: providerId } });
    },

    async signOut() {
      await ensureConfigured();
      await signOut();
    },
  };
}
