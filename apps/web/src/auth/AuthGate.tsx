import { useNavigate, useRouterState } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
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

  // Public routes must render independently of the Cognito session bootstrap.
  // This keeps the landing page available during SSR and slow auth requests.
  if (isPublic) return <>{children}</>;

  if (auth.status === "loading") {
    return <LoadingScreen label="Anmeldung wird geprüft …" />;
  }

  if (auth.status === "anonymous") {
    return <LoadingScreen label="Weiterleitung …" />;
  }

  return <>{children}</>;
}
