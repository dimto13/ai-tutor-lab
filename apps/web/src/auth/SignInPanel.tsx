import { GraduationCap } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { useAuth } from "./AuthContext";

export type AuthPanelMode = "sign-in" | "register";
type RegistrationStep = "credentials" | "confirmation";
type AuthAction = "sign-in" | "register" | "confirm";

function ErrorMessage({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
    >
      {message}
    </p>
  );
}

/**
 * Password / SSO sign-in and self-service registration form. Rendered by the
 * public `/anmelden` route. Cloud-specific auth details terminate behind AuthService.
 */
export function SignInPanel({ initialMode = "sign-in" }: { initialMode?: AuthPanelMode }) {
  const auth = useAuth();
  const [mode, setMode] = useState<AuthPanelMode>(initialMode);
  const [registrationStep, setRegistrationStep] = useState<RegistrationStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [confirmationDestination, setConfirmationDestination] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastAuthAction, setLastAuthAction] = useState<AuthAction | null>(null);
  const oidcProviderId = import.meta.env["VITE_AUTH_OIDC_PROVIDER_ID"]?.trim();
  const isLoading = auth.status === "loading";

  useEffect(() => {
    setMode(initialMode);
    setRegistrationStep("credentials");
    setLocalError(null);
    setNotice(null);
    setLastAuthAction(null);
  }, [initialMode]);

  const switchToRegister = () => {
    setMode("register");
    setRegistrationStep("credentials");
    setPassword("");
    setPasswordConfirmation("");
    setConfirmationCode("");
    setConfirmationDestination(null);
    setLocalError(null);
    setNotice(null);
    setLastAuthAction(null);
  };

  const switchToSignIn = (registeredEmail?: string, nextNotice?: string) => {
    setMode("sign-in");
    setRegistrationStep("credentials");
    if (registeredEmail) setEmail(registeredEmail);
    setPassword("");
    setPasswordConfirmation("");
    setConfirmationCode("");
    setConfirmationDestination(null);
    setLocalError(null);
    setNotice(nextNotice ?? null);
    setLastAuthAction(null);
  };

  const submitSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;
    setLocalError(null);
    setNotice(null);
    setLastAuthAction("sign-in");
    try {
      await auth.signIn({ method: "password", identifier: email.trim(), password });
    } catch {
      // AuthProvider exposes the normalized error below the form.
    }
  };

  const submitRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;

    if (password !== passwordConfirmation) {
      setLocalError("Die Passwörter stimmen nicht überein.");
      setLastAuthAction(null);
      return;
    }

    setLocalError(null);
    setNotice(null);
    setLastAuthAction("register");
    const normalizedEmail = email.trim();

    try {
      const result = await auth.signUp({ email: normalizedEmail, password });
      if (result.status === "confirmation_required") {
        setEmail(result.email);
        setConfirmationDestination(result.destination);
        setRegistrationStep("confirmation");
        setLastAuthAction(null);
        return;
      }

      switchToSignIn(
        result.email,
        "Registrierung abgeschlossen. Du kannst dich jetzt mit deinem Lernkonto anmelden.",
      );
    } catch {
      // AuthProvider exposes the normalized error below the form.
    }
  };

  const submitConfirmation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;
    setLocalError(null);
    setNotice(null);
    setLastAuthAction("confirm");

    try {
      await auth.confirmSignUp({
        email: email.trim(),
        confirmationCode: confirmationCode.trim(),
      });
      switchToSignIn(
        email.trim(),
        "Deine E-Mail ist bestätigt. Du kannst dich jetzt mit deinem Lernkonto anmelden.",
      );
    } catch {
      // AuthProvider exposes the normalized error below the form.
    }
  };

  const signInWithOidc = async () => {
    if (!oidcProviderId || isLoading) return;
    setLocalError(null);
    setNotice(null);
    setLastAuthAction("sign-in");
    try {
      await auth.signIn({ method: "oidc", providerId: oidcProviderId });
    } catch {
      // AuthProvider exposes the normalized error below the form.
    }
  };

  const visibleAuthError =
    auth.error &&
    ((mode === "sign-in" && lastAuthAction === "sign-in") ||
      (mode === "register" &&
        ((registrationStep === "credentials" && lastAuthAction === "register") ||
          (registrationStep === "confirmation" && lastAuthAction === "confirm"))))
      ? auth.error
      : null;

  const subtitle =
    mode === "sign-in"
      ? "Mit deinem Lernkonto anmelden"
      : registrationStep === "credentials"
        ? "Neues Lernkonto registrieren"
        : "E-Mail-Adresse bestätigen";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15">
            <GraduationCap className="h-5 w-5 text-accent" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-foreground">AI Training Lab</h1>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        {notice ? (
          <p
            role="status"
            className="mt-5 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-foreground"
          >
            {notice}
          </p>
        ) : null}

        {mode === "sign-in" ? (
          <>
            <form className="mt-6 space-y-4" onSubmit={(event) => void submitSignIn(event)}>
              <label className="block text-sm text-foreground">
                E-Mail
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring"
                />
              </label>

              <label className="block text-sm text-foreground">
                Passwort
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring"
                />
              </label>

              {localError ? <ErrorMessage message={localError} /> : null}
              {visibleAuthError ? <ErrorMessage message={visibleAuthError} /> : null}

              <button
                type="submit"
                disabled={isLoading}
                aria-busy={isLoading}
                className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading && lastAuthAction === "sign-in" ? "Anmeldung läuft …" : "Anmelden"}
              </button>
            </form>

            {oidcProviderId ? (
              <>
                <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  oder
                  <span className="h-px flex-1 bg-border" />
                </div>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => void signInWithOidc()}
                  className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Mit Unternehmens-SSO anmelden
                </button>
              </>
            ) : null}

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Noch kein Lernkonto?{" "}
              <button
                type="button"
                onClick={switchToRegister}
                className="font-medium text-accent hover:underline"
              >
                Registrieren
              </button>
            </p>
          </>
        ) : registrationStep === "credentials" ? (
          <>
            <form className="mt-6 space-y-4" onSubmit={(event) => void submitRegistration(event)}>
              <label className="block text-sm text-foreground">
                E-Mail
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring"
                />
              </label>

              <label className="block text-sm text-foreground">
                Passwort
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring"
                />
              </label>

              <label className="block text-sm text-foreground">
                Passwort wiederholen
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring"
                />
              </label>

              {localError ? <ErrorMessage message={localError} /> : null}
              {visibleAuthError ? <ErrorMessage message={visibleAuthError} /> : null}

              <button
                type="submit"
                disabled={isLoading}
                aria-busy={isLoading}
                className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading && lastAuthAction === "register"
                  ? "Registrierung läuft …"
                  : "Lernkonto registrieren"}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Du hast bereits ein Lernkonto?{" "}
              <button
                type="button"
                onClick={() => switchToSignIn()}
                className="font-medium text-accent hover:underline"
              >
                Anmelden
              </button>
            </p>
          </>
        ) : (
          <>
            <p className="mt-6 text-sm leading-6 text-muted-foreground">
              Wir haben einen Bestätigungscode an {confirmationDestination ?? email} gesendet.
            </p>
            <form className="mt-4 space-y-4" onSubmit={(event) => void submitConfirmation(event)}>
              <label className="block text-sm text-foreground">
                Bestätigungscode
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={confirmationCode}
                  onChange={(event) => setConfirmationCode(event.target.value)}
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring"
                />
              </label>

              {visibleAuthError ? <ErrorMessage message={visibleAuthError} /> : null}

              <button
                type="submit"
                disabled={isLoading}
                aria-busy={isLoading}
                className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading && lastAuthAction === "confirm"
                  ? "Bestätigung läuft …"
                  : "E-Mail bestätigen"}
              </button>
            </form>

            <div className="mt-6 flex justify-between gap-4 text-xs">
              <button
                type="button"
                onClick={switchToRegister}
                className="text-muted-foreground hover:text-foreground"
              >
                E-Mail ändern
              </button>
              <button
                type="button"
                onClick={() => switchToSignIn(email)}
                className="font-medium text-accent hover:underline"
              >
                Zur Anmeldung
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
