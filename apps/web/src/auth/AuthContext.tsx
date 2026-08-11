import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { AuthService, AuthSession, SignInRequest, SignInResult } from "./authService";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

export interface AuthContextValue {
  status: AuthStatus;
  session: AuthSession | null;
  error: string | null;
  refresh: () => Promise<void>;
  signIn: (request: SignInRequest) => Promise<SignInResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Die Authentifizierung ist fehlgeschlagen.";
}

export function AuthProvider({ service, children }: { service: AuthService; children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(
    async (forceRefresh: boolean) => {
      setStatus("loading");
      setError(null);

      try {
        const currentSession = forceRefresh
          ? await service.refreshSession()
          : await service.getSession();
        setSession(currentSession);
        setStatus(currentSession ? "authenticated" : "anonymous");
      } catch (cause) {
        setSession(null);
        setError(messageOf(cause));
        setStatus("anonymous");
      }
    },
    [service],
  );

  const refresh = useCallback(async () => {
    await loadSession(true);
  }, [loadSession]);

  useEffect(() => {
    void loadSession(false);
  }, [loadSession]);

  const signIn = useCallback(
    async (request: SignInRequest) => {
      setStatus("loading");
      setError(null);

      try {
        const result = await service.signIn(request);
        if (result.status === "authenticated") {
          setSession(result.session);
          setStatus("authenticated");
        }
        return result;
      } catch (cause) {
        setSession(null);
        setError(messageOf(cause));
        setStatus("anonymous");
        throw cause;
      }
    },
    [service],
  );

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await service.signOut();
      setSession(null);
      setStatus("anonymous");
    } catch (cause) {
      setError(messageOf(cause));
      throw cause;
    }
  }, [service]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, error, refresh, signIn, signOut }),
    [status, session, error, refresh, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
