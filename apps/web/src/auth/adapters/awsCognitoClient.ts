import { Amplify } from "aws-amplify";
import {
  fetchAuthSession,
  fetchUserAttributes,
  getCurrentUser,
  signIn,
  signInWithRedirect,
  signOut,
} from "aws-amplify/auth";

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

      const [user, rawAttributes] = await Promise.all([getCurrentUser(), fetchUserAttributes()]);
      const attributes = rawAttributes as Record<string, string | undefined>;
      const idTokenPayload = session.tokens.idToken?.payload ?? {};
      const accessTokenPayload = session.tokens.accessToken.payload;

      return {
        userId: user.userId,
        tenantId:
          attributes["custom:tenant_id"] ?? stringClaim(idTokenPayload["custom:tenant_id"]),
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
      return result.isSignedIn || result.nextStep.signInStep === "DONE" ? "done" : "requires_action";
    },

    async signInWithOidc(providerId) {
      await ensureConfigured();

      // TanStack Start is an SSR/MPA-capable app. Amplify requires the OAuth
      // listener on the client so the redirect response can complete there.
      await import("aws-amplify/auth/enable-oauth-listener");
      await signInWithRedirect({ provider: { custom: providerId } });
    },

    async signOut() {
      await ensureConfigured();
      await signOut();
    },
  };
}
