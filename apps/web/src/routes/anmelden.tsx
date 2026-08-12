import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useAuth } from "@/auth/AuthContext";
import { SignInPanel } from "@/auth/SignInPanel";

interface AuthPageSearch {
  mode?: "registrieren";
}

export const Route = createFileRoute("/anmelden")({
  validateSearch: (search: Record<string, unknown>): AuthPageSearch => ({
    mode: search["mode"] === "registrieren" ? "registrieren" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Anmelden – AI Training Lab" },
      {
        name: "description",
        content: "Beim AI Training Lab anmelden oder ein Lernkonto registrieren.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SignInRoute,
});

function SignInRoute() {
  const auth = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const isAuthenticated = auth.status === "authenticated";

  useEffect(() => {
    if (!isAuthenticated) return;
    void navigate({ to: "/", replace: true });
  }, [isAuthenticated, navigate]);

  return <SignInPanel initialMode={search.mode === "registrieren" ? "register" : "sign-in"} />;
}
