import { createFileRoute } from "@tanstack/react-router";

import { LandingPage } from "@/landing/LandingPage";

export const Route = createFileRoute("/willkommen")({
  head: () => ({
    meta: [
      { title: "AI Training Lab – KI-Werkzeuge bedienen lernen" },
      {
        name: "description",
        content:
          "Interaktive KI-Trainings im Browser: VS Code, GitHub und Copilot erst einzeln kennenlernen, dann im echten Workflow verbinden – begleitet von einem KI-Tutor.",
      },
      { property: "og:title", content: "AI Training Lab – KI-Werkzeuge bedienen lernen" },
      {
        property: "og:description",
        content:
          "Nachgebaute Werkzeuge im Browser, drei Härtegrade und ein Tutor, der deinen Schritt kennt.",
      },
    ],
  }),
  component: LandingPage,
});
