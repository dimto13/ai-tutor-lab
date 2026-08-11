import type { AuthService, AuthSession, SignInResult } from "../authService";
import {
  createAmplifyCognitoClient,
  type AmplifyCognitoClientOptions,
  type CognitoAuthClient,
} from "./awsCognitoClient";

function toAuthSession(
  snapshot: Awaited<ReturnType<CognitoAuthClient["getSession"]>>,
): AuthSession | null {
  if (!snapshot) return null;

  return {
    identity: {
      userId: snapshot.userId,
      tenantId: snapshot.tenantId,
      email: snapshot.email,
      displayName: snapshot.displayName,
      roles: snapshot.roles,
    },
    accessToken: snapshot.accessToken,
    expiresAt: snapshot.expiresAt,
  };
}

/**
 * AWS/Cognito implementation of the cloud-neutral AuthService port.
 */
export function createCognitoAuthService(
  client: CognitoAuthClient = createAmplifyCognitoClient(),
): AuthService {
  return {
    async getSession() {
      return toAuthSession(await client.getSession());
    },

    async signIn(request): Promise<SignInResult> {
      if (request.method === "oidc") {
        await client.signInWithOidc(request.providerId);
        return { status: "redirecting" };
      }

      const outcome = await client.signInWithPassword(request.identifier, request.password);
      if (outcome !== "done") {
        throw new Error("Authentication requires an additional verification step.");
      }

      const session = toAuthSession(await client.getSession());
      if (!session) {
        throw new Error("Authentication completed without an available user session.");
      }

      return {
        status: "authenticated",
        session,
      };
    },

    async signOut() {
      await client.signOut();
    },
  };
}

export function createDefaultCognitoAuthService(
  options: AmplifyCognitoClientOptions = {},
): AuthService {
  return createCognitoAuthService(createAmplifyCognitoClient(options));
}
