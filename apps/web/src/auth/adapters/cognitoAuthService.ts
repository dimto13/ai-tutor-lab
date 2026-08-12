import type { AuthService, AuthSession, SignInResult, SignUpResult } from "../authService";
import {
  createAmplifyCognitoClient,
  type AmplifyCognitoClientOptions,
  type CognitoAuthClient,
} from "./awsCognitoClient.ts";

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

    async refreshSession() {
      return toAuthSession(await client.getSession(true));
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

    async signUp(request): Promise<SignUpResult> {
      const outcome = await client.signUpWithPassword(request.email, request.password);

      if (outcome.status === "requires_action") {
        throw new Error("Registration requires an additional verification step.");
      }

      if (outcome.status === "confirmation_required") {
        return {
          status: "confirmation_required",
          email: request.email,
          destination: outcome.destination,
        };
      }

      return {
        status: "complete",
        email: request.email,
      };
    },

    async confirmSignUp(request) {
      const outcome = await client.confirmSignUp(request.email, request.confirmationCode);
      if (outcome !== "done") {
        throw new Error("Registration confirmation requires an additional verification step.");
      }
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
