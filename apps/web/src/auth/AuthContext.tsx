import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  AuthService,
  AuthSession,
  ConfirmSignUpRequest,
  ResendSignUpCodeRequest,
  ResendSignUpCodeResult,
  SignInRequest,
  SignInResult,
  SignUpRequest,
  SignUpResult,
} from "./authService";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

export interface AuthContextValue {
  status: AuthStatus;
  session: AuthSession | null;
  error: string | null;
  refresh: () => Promise<void>;
  signIn: (request: SignInRequest) => Promise<SignInResult>;
  signUp: (request: SignUpRequest) => Promise<SignUpResult>;
  confirmSignUp: (request: ConfirmSignUpRequest) => Promise<void>;
  resendSignUpCode: (request: ResendSignUpCodeRequest) => Promise<ResendSignUpCodeResult>;
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
        } else if (result.status === "confirmation_required") {
          setSession(null);
          setStatus("anonymous");
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

  const signUp = useCallback(
    async (request: SignUpRequest) => {
      setStatus("loading");
      setError(null);

      try {
        const result = await service.signUp(request);
        setSession(null);
        setStatus("anonymous");
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

  const confirmSignUp = useCallback(
    async (request: ConfirmSignUpRequest) => {
      setStatus("loading");
      setError(null);

      try {
        await service.confirmSignUp(request);
        setSession(null);
        setStatus("anonymous");
      } catch (cause) {
        setSession(null);
        setError(messageOf(cause));
        setStatus("anonymous");
        throw cause;
      }
    },
    [service],
  );

  const resendSignUpCode = useCallback(
    async (request: ResendSignUpCodeRequest) => {
      setStatus("loading");
      setError(null);

      try {
        const result = await service.resendSignUpCode(request);
        setSession(null);
        setStatus("anonymous");
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
    () => ({
      status,
      session,
      error,
      refresh,
      signIn,
      signUp,
      confirmSignUp,
      resendSignUpCode,
      signOut,
    }),
    [status, session, error, refresh, signIn, signUp, confirmSignUp, resendSignUpCode, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
