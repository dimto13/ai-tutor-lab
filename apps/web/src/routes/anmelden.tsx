import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useAuth } from "@/auth/AuthContext";
import { SignInPanel } from "@/auth/SignInPanel";

export const Route = createFileRoute("/anmelden")({
  head: () => ({
    meta: [
      { title: "Anmelden – AI Training Lab" },
      { name: "description", content: "Mit dem Lernkonto beim AI Training Lab anmelden." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SignInRoute,
});

function SignInRoute() {
  const auth = useAuth();
  const navigate = useNavigate();
  const isAuthenticated = auth.status === "authenticated";

  useEffect(() => {
    if (!isAuthenticated) return;
    void navigate({ to: "/", replace: true });
  }, [isAuthenticated, navigate]);

  return <SignInPanel />;
}
