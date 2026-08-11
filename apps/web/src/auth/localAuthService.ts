import type { AuthService, AuthSession, SignInResult, UserIdentity } from "./authService";

export interface LocalAuthServiceOptions {
  identity: UserIdentity;
  accessToken?: string;
  expiresAt?: string;
  initiallyAuthenticated?: boolean;
}

/**
 * Deterministic local adapter for tests and local development.
 * It deliberately implements the same AuthService contract as cloud adapters.
 */
export function createLocalAuthService(options: LocalAuthServiceOptions): AuthService {
  const createSession = (): AuthSession => ({
    identity: options.identity,
    accessToken: options.accessToken ?? "local-development-token",
    expiresAt: options.expiresAt ?? null,
  });
  let currentSession: AuthSession | null = options.initiallyAuthenticated ? createSession() : null;

  return {
    async getSession() {
      return currentSession;
    },

    async refreshSession() {
      return currentSession;
    },

    async signIn(): Promise<SignInResult> {
      currentSession = createSession();

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
