import type { AuthService, AuthSession, SignInResult, UserIdentity } from "./authService";

export interface LocalAuthServiceOptions {
  identity: UserIdentity;
  accessToken?: string;
  expiresAt?: string;
}

/**
 * Deterministic local adapter for tests and local development.
 * It deliberately implements the same AuthService contract as cloud adapters.
 */
export function createLocalAuthService(options: LocalAuthServiceOptions): AuthService {
  let currentSession: AuthSession | null = null;

  return {
    async getSession() {
      return currentSession;
    },

    async signIn(): Promise<SignInResult> {
      currentSession = {
        identity: options.identity,
        accessToken: options.accessToken ?? "local-development-token",
        expiresAt: options.expiresAt ?? null,
      };

      return {
        status: "authenticated",
        session: currentSession,
      };
    },

    async signOut() {
      currentSession = null;
    },
  };
}
