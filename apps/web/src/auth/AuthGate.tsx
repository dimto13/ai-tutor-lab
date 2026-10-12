import { useNavigate, useRouterState } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "./AuthContext";
import { authGateDecision } from "./authGatePolicy";

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
  const targetPathname = useRouterState({ select: (state) => state.location.pathname });
  // resolvedLocation is committed only after the target route's matches are mounted, so it names
  // the route <Outlet /> actually renders. Before the first resolve it equals the location.
  const renderedPathname = useRouterState({
    select: (state) => state.resolvedLocation?.pathname ?? state.location.pathname,
  });
  const { view, redirectToLanding } = authGateDecision({
    status: auth.status,
    targetPathname,
    renderedPathname,
  });

  useEffect(() => {
    if (!redirectToLanding) return;
    void navigate({ to: "/willkommen", replace: true });
  }, [navigate, redirectToLanding]);

  // Public routes render independently of the Cognito session bootstrap. This keeps the landing
  // page available during SSR and slow auth requests.
  if (view === "content") return <>{children}</>;

  return (
    <LoadingScreen label={view === "checking" ? "Anmeldung wird geprüft …" : "Weiterleitung …"} />
  );
}
