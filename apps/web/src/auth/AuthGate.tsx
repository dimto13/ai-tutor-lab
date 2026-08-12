import { useNavigate, useRouterState } from "@tanstack/react-router";
import { GraduationCap, LogOut } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "./AuthContext";

/**
 * Routes that anonymous visitors may reach. Everything else is redirected to
 * the public landing page, which is the entry point for people who do not have
 * a learning account yet.
 */
export const PUBLIC_PATHS = ["/willkommen", "/anmelden"] as const;

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="text-center">
        <GraduationCap className="mx-auto h-8 w-8 text-accent" />
        <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      </div>
    </main>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isPublic = isPublicPath(pathname);
  const shouldRedirect = auth.status === "anonymous" && !isPublic;

  useEffect(() => {
    if (!shouldRedirect) return;
    void navigate({ to: "/willkommen", replace: true });
  }, [navigate, shouldRedirect]);

  if (auth.status === "loading") {
    return <LoadingScreen label="Anmeldung wird geprüft …" />;
  }

  // Public routes render their own chrome and must not show the sign-out badge.
  if (isPublic) return <>{children}</>;

  if (auth.status === "anonymous") {
    return <LoadingScreen label="Weiterleitung …" />;
  }

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
