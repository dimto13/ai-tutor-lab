import type { AuthService, AuthSession, SignInResult, SignUpResult } from "../authService";
import { parseApplicationRolesFromGroups } from "../roles.ts";
import {
  createAmplifyCognitoClient,
  type AmplifyCognitoClientOptions,
  type CognitoAuthClient,
} from "./awsCognitoClient.ts";

const BETA_ACCESS_DENIED_MARKER = "BETA_ACCESS_DENIED";
const BETA_ACCESS_DENIED_MESSAGE =
  "Diese geschlossene Beta ist aktuell nur für eingeladene Tester verfügbar.";

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
      roles: parseApplicationRolesFromGroups(snapshot.roles),
    },
    accessToken: snapshot.accessToken,
    expiresAt: snapshot.expiresAt,
  };
}

function betaAccessError(error: unknown): Error | null {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(BETA_ACCESS_DENIED_MARKER) ? new Error(BETA_ACCESS_DENIED_MESSAGE) : null;
}

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
      if (outcome === "confirm_sign_up") {
        return {
          status: "confirmation_required",
          email: request.identifier,
        };
      }
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
      let outcome: Awaited<ReturnType<CognitoAuthClient["signUpWithPassword"]>>;
      try {
        outcome = await client.signUpWithPassword(request.email, request.password);
      } catch (error) {
        const mapped = betaAccessError(error);
        if (mapped) throw mapped;
        throw error;
      }

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

    async resendSignUpCode(request) {
      return {
        email: request.email,
        destination: await client.resendSignUpCode(request.email),
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
