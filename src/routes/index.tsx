import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap, PlayCircle, ArrowRight, Terminal, Bot, GitBranch } from "lucide-react";
import { useStoredProgressPercent } from "@/state/trainingStore";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Meine Trainings – AI Training Lab" },
      {
        name: "description",
        content:
          "Interaktive KI-Schulungsplattform: geführte Trainings zu Git, VS Code, GitHub Copilot und CLI-Agenten – direkt im Browser.",
      },
      { property: "og:title", content: "Meine Trainings – AI Training Lab" },
      {
        property: "og:description",
        content: "Geführte, interaktive Trainings zu KI- und Entwickler-Workflows für Unternehmen.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const percent = useStoredProgressPercent();

  const trainings = [
    {
      id: "git-basics",
      title: "Git, VS Code & GitHub Copilot – Grundlagen",
      description:
        "Arbeitsumgebung kennenlernen, Dateien anlegen, Code schreiben, Änderungen versionieren und Copilot nutzen.",
      steps: 8,
      icon: GitBranch,
      available: true,
    },
    {
      id: "cli-agents",
      title: "CLI-Agenten kennenlernen",
      description: "Agenten im Terminal steuern, Aufgaben delegieren und Ergebnisse prüfen.",
      steps: 6,
      icon: Terminal,
      available: false,
    },
    {
      id: "m365-copilot",
      title: "M365 Copilot Grundlagen",
      description: "Copilot in Outlook, Teams und Word produktiv und richtlinienkonform einsetzen.",
      steps: 7,
      icon: Bot,
      available: false,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-6">
          <GraduationCap className="h-5 w-5 text-accent" />
          <span className="text-sm font-semibold tracking-tight text-foreground">AI Training Lab</span>
          <span className="ml-auto text-xs text-muted-foreground">Maria Schmidt · Contoso GmbH</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Meine Trainings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Geführte, interaktive Module. Du arbeitest in einer simulierten Entwicklungsumgebung – der KI-Tutor begleitet
          dich Schritt für Schritt.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {trainings.map((t) => {
            const p = t.available ? (percent ?? 0) : 0;
            return (
              <article
                key={t.id}
                className="flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-ring/60"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15">
                    <t.icon className="h-4 w-4 text-accent" />
                  </span>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {t.steps} Schritte
                  </span>
                </div>
                <h2 className="mt-3 text-base font-semibold leading-snug text-foreground">{t.title}</h2>
                <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted-foreground">{t.description}</p>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      {!t.available ? "Noch nicht gestartet" : p === 0 ? "Noch nicht gestartet" : `${p} % abgeschlossen`}
                    </span>
                    {t.available && p > 0 ? <span>{p} %</span> : null}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${p}%` }} />
                  </div>
                </div>

                {t.available ? (
                  <Link
                    to="/training/$scenarioId"
                    params={{ scenarioId: "git-basics" }}
                    className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
                  >
                    {p > 0 ? "Fortsetzen" : "Starten"} <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <button
                    disabled
                    title="Vorschau – im POC nicht funktional"
                    className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-foreground opacity-50"
                  >
                    <PlayCircle className="h-4 w-4" /> Starten
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
