import { createFileRoute, Link } from "@tanstack/react-router";
import {
  GraduationCap,
  PlayCircle,
  ArrowRight,
  Terminal,
  Bot,
  GitBranch,
  Github,
  Code2,
  Search,
  Route as RouteIcon,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useStoredProgressPercent } from "@/state/trainingStore";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Meine Trainings – AI Training Lab" },
      {
        name: "description",
        content:
          "Interaktive KI-Schulungsplattform: Werkzeuge einzeln kennenlernen und anschließend in realistischen Workflows kombinieren.",
      },
      { property: "og:title", content: "Meine Trainings – AI Training Lab" },
      {
        property: "og:description",
        content: "Interaktive Trainings zu Entwicklerwerkzeugen und KI-Workflows für Unternehmen.",
      },
    ],
  }),
  component: Dashboard,
});

type TrainingModeOption = {
  scenarioId: string;
  label: string;
  description: string;
  icon: LucideIcon;
  multiplier: string;
};

type TrainingCardModel = {
  id: string;
  scenarioId: string | null;
  modes?: TrainingModeOption[];
  title: string;
  description: string;
  steps?: number;
  icon: LucideIcon;
  available: boolean;
  label?: string;
};

const toolTrainings: TrainingCardModel[] = [
  {
    id: "vscode-basics",
    scenarioId: null,
    title: "Visual Studio Code – Grundlagen",
    description:
      "Oberfläche, Activity Bar, Explorer, Ordner, Workspaces, Editor und Panel verstehen und selbst bedienen.",
    icon: Code2,
    available: true,
    label: "IDE · 3 Modi",
    modes: [
      {
        scenarioId: "vscode-basics.explore",
        label: "Explore",
        description: "Oberfläche frei erkunden",
        icon: Search,
        multiplier: "×0,5",
      },
      {
        scenarioId: "vscode-basics.guided",
        label: "Guided",
        description: "Schritt für Schritt lernen",
        icon: RouteIcon,
        multiplier: "×1,0",
      },
      {
        scenarioId: "vscode-basics.challenge",
        label: "Challenge",
        description: "Ziel selbstständig erreichen",
        icon: Target,
        multiplier: "×2,0",
      },
    ],
  },
  {
    id: "github-basics",
    scenarioId: null,
    title: "GitHub – Grundlagen",
    description:
      "Repositories, Branches, Remotes, Pull Requests und die Zusammenarbeit auf GitHub als eigenes Werkzeug kennenlernen.",
    icon: Github,
    available: false,
    label: "Source Control Platform",
  },
  {
    id: "github-copilot-basics",
    scenarioId: null,
    title: "GitHub Copilot – Grundlagen",
    description:
      "Chat, Inline-Vorschläge, Kontext und den sinnvollen Einsatz von Copilot unabhängig vom Gesamtworkflow kennenlernen.",
    icon: Bot,
    available: false,
    label: "AI Coding Assistant",
  },
];

const workflowTrainings: TrainingCardModel[] = [
  {
    id: "developer-workflow-basics",
    scenarioId: "git-basics",
    title: "VS Code, Git & GitHub Copilot – Zusammenspiel",
    description:
      "Die bereits bekannten Werkzeuge in einem durchgängigen Entwicklungsablauf verbinden: Projekt bearbeiten, Änderungen versionieren und Copilot einsetzen.",
    steps: 8,
    icon: GitBranch,
    available: true,
    label: "Workflow",
  },
];

const otherTrainings: TrainingCardModel[] = [
  {
    id: "cli-agents",
    scenarioId: null,
    title: "CLI-Agenten kennenlernen",
    description: "Agenten im Terminal steuern, Aufgaben delegieren und Ergebnisse prüfen.",
    icon: Terminal,
    available: false,
    label: "CLI Agent",
  },
  {
    id: "m365-copilot",
    scenarioId: null,
    title: "M365 Copilot Grundlagen",
    description: "Copilot in Outlook, Teams und Word produktiv und richtlinienkonform einsetzen.",
    icon: Bot,
    available: false,
    label: "Office Assistant",
  },
];

function Dashboard() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-6">
          <GraduationCap className="h-5 w-5 text-accent" />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            AI Training Lab
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            Maria Schmidt · Contoso GmbH
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Meine Trainings</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Lerne Werkzeuge zuerst einzeln kennen und wende sie danach in gemeinsamen Workflows an. So
          bleiben Bedienwissen, Fachbegriffe und das Zusammenspiel der Tools klar voneinander
          getrennt.
        </p>

        <TrainingSection
          title="Werkzeuge einzeln kennenlernen"
          description="Jeder Grundkurs konzentriert sich auf genau ein Werkzeug und seine eigenen Konzepte."
          trainings={toolTrainings}
        />

        <TrainingSection
          title="Werkzeuge im Zusammenspiel"
          description="Diese Trainings setzen die Einzelgrundlagen voraus und üben einen durchgängigen Arbeitsablauf über mehrere Werkzeuge hinweg."
          trainings={workflowTrainings}
        />

        <TrainingSection
          title="Weitere Lernbereiche"
          description="Weitere Technologien und Arbeitskontexte werden nach demselben Prinzip als eigenständige Lernmodule ergänzt."
          trainings={otherTrainings}
        />
      </main>
    </div>
  );
}

function TrainingSection({
  title,
  description,
  trainings,
}: {
  title: string;
  description: string;
  trainings: TrainingCardModel[];
}) {
  return (
    <section className="mt-10">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {trainings.map((training) => (
          <TrainingCard key={training.id} training={training} />
        ))}
      </div>
    </section>
  );
}

function TrainingCard({ training }: { training: TrainingCardModel }) {
  const Icon = training.icon;

  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-ring/60">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15">
          <Icon className="h-4 w-4 text-accent" />
        </span>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {training.label ?? (training.steps ? `${training.steps} Schritte` : "Training")}
        </span>
        {training.steps ? (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {training.steps} Schritte
          </span>
        ) : null}
      </div>

      <h3 className="mt-3 text-base font-semibold leading-snug text-foreground">
        {training.title}
      </h3>
      <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted-foreground">
        {training.description}
      </p>

      {training.modes ? (
        <div className="mt-4 space-y-2">
          {training.modes.map((mode) => (
            <ModeAction key={mode.scenarioId} mode={mode} />
          ))}
        </div>
      ) : (
        <SingleTrainingAction training={training} />
      )}
    </article>
  );
}

function ModeAction({ mode }: { mode: TrainingModeOption }) {
  const percent = useStoredProgressPercent(mode.scenarioId) ?? 0;
  const Icon = mode.icon;
  return (
    <Link
      to="/training/$scenarioId"
      params={{ scenarioId: mode.scenarioId }}
      className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-ring hover:bg-white/5"
    >
      <Icon className="h-4 w-4 shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          {mode.label}{" "}
          <span className="text-[10px] font-normal text-muted-foreground">{mode.multiplier}</span>
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">{mode.description}</span>
      </span>
      <span className="text-[11px] text-muted-foreground">
        {percent > 0 ? `${percent}%` : "Start"}
      </span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
    </Link>
  );
}

function SingleTrainingAction({ training }: { training: TrainingCardModel }) {
  const percent = useStoredProgressPercent(training.scenarioId);
  const p = training.available ? (percent ?? 0) : 0;

  return (
    <>
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {!training.available
              ? "In Vorbereitung"
              : p === 0
                ? "Noch nicht gestartet"
                : `${p} % abgeschlossen`}
          </span>
          {training.available && p > 0 ? <span>{p} %</span> : null}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${p}%` }}
          />
        </div>
      </div>

      {training.available && training.scenarioId ? (
        <Link
          to="/training/$scenarioId"
          params={{ scenarioId: training.scenarioId }}
          className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          {p > 0 ? "Fortsetzen" : "Starten"} <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <button
          disabled
          title="Dieses Training wird als eigenes Modul ergänzt."
          className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-foreground opacity-50"
        >
          <PlayCircle className="h-4 w-4" /> In Vorbereitung
        </button>
      )}
    </>
  );
}
