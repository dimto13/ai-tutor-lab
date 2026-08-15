import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { AccountMenu } from "@/auth/AccountMenu";
import { CompetencyMatrix } from "@/components/dashboard/CompetencyMatrix";

export const Route = createFileRoute("/kompetenz")({
  head: () => ({
    meta: [
      { title: "Kompetenzprofil – AI Training Lab" },
      {
        name: "description",
        content: "Gemessene Kompetenz je Technologie auf Basis bestätigter Trainingsdaten.",
      },
    ],
  }),
  component: CompetencyProfilePage,
});

function CompetencyProfilePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-6">
          <GraduationCap className="h-5 w-5 text-accent" />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            AI Training Lab
          </span>
          <div className="ml-auto">
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Meine Trainings
        </Link>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
          Mein Kompetenzprofil
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Diese Ansicht trennt nachgewiesene Praxis von deiner persönlichen Selbsteinschätzung.
          Kompetenzstufen werden aus serverseitig bestätigten Punkten und belastbarer
          Challenge-Evidenz abgeleitet.
        </p>

        <CompetencyMatrix />
      </main>
    </div>
  );
}
