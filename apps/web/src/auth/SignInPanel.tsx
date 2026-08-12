import { GraduationCap } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useAuth } from "./AuthContext";

/**
 * Password / SSO sign-in form. Rendered by the public `/anmelden` route.
 * Extracted from AuthGate so the gate itself only decides *whether* a route is
 * reachable, never *how* someone signs in.
 */
export function SignInPanel() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const oidcProviderId = import.meta.env["VITE_AUTH_OIDC_PROVIDER_ID"]?.trim();
  const isLoading = auth.status === "loading";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;
    try {
      await auth.signIn({ method: "password", identifier: email.trim(), password });
    } catch {
      // AuthProvider exposes the normalized error below the form.
    }
  };

  const signInWithOidc = async () => {
    if (!oidcProviderId || isLoading) return;
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
            disabled={isLoading}
            aria-busy={isLoading}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Anmeldung läuft …" : "Anmelden"}
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
      </section>
    </main>
  );
}
