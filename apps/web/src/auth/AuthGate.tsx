import { GraduationCap, LogOut } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { useAuth } from "./AuthContext";

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();

  if (auth.status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="text-center">
          <GraduationCap className="mx-auto h-8 w-8 text-accent" />
          <p className="mt-4 text-sm text-muted-foreground">Anmeldung wird geprüft …</p>
        </div>
      </main>
    );
  }

  if (auth.status === "anonymous") return <SignInPanel />;

  const identity = auth.session?.identity;
  const identityLabel = identity?.displayName ?? identity?.email ?? "Angemeldet";

  return (
    <>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-lg border border-border bg-panel/95 px-3 py-2 shadow-lg backdrop-blur">
        <span className="max-w-48 truncate text-xs text-muted-foreground">{identityLabel}</span>
        <button
          type="button"
          onClick={() => void auth.signOut().catch(() => undefined)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-white/5"
        >
          <LogOut className="h-3.5 w-3.5" />
          Abmelden
        </button>
      </div>
    </>
  );
}

function SignInPanel() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const oidcProviderId = import.meta.env["VITE_AUTH_OIDC_PROVIDER_ID"]?.trim();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await auth.signIn({ method: "password", identifier: email.trim(), password });
    } catch {
      // AuthProvider exposes the normalized error below the form.
    }
  };

  const signInWithOidc = async () => {
    if (!oidcProviderId) return;
    try {
      await auth.signIn({ method: "oidc", providerId: oidcProviderId });
    } catch {
      // AuthProvider exposes the normalized error below the form.
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15">
            <GraduationCap className="h-5 w-5 text-accent" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-foreground">AI Training Lab</h1>
            <p className="text-xs text-muted-foreground">Mit deinem Lernkonto anmelden</p>
          </div>
        </div>

        <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
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

          {auth.error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {auth.error}
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Anmelden
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
              onClick={() => void signInWithOidc()}
              className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-white/5"
            >
              Mit Unternehmens-SSO anmelden
            </button>
          </>
        ) : null}
      </section>
    </main>
  );
}
