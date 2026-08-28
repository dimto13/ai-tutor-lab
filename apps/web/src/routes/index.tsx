import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Code2,
  GitBranch,
  Github,
  GraduationCap,
  Lightbulb,
  PlayCircle,
  Route as RouteIcon,
  Search,
  Target,
  Terminal,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AccountMenu } from "@/auth/AccountMenu";
import { getModuleLineById, moduleLineCatalog } from "@/catalog";
import { DashboardLearningOverview } from "@/components/dashboard/DashboardLearningOverview";
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
      "Keine IT-Vorkenntnisse erforderlich. Lerne Oberfläche, Explorer, Suche, Command Palette, Datei/Ordner/Workspace, Editor und Speichern sowie Terminal, Problems, Output, Settings und Extensions kennen. Explore ca. 10 Min., Guided ca. 14 Min., Challenge ca. 8 Min.",
    icon: Code2,
    available: true,
    label: "IDE · 3 Modi + Speed Challenge",
    modes: [
      { scenarioId: "vscode-basics.explore", label: "Explore", description: "Oberfläche frei erkunden", icon: Search, multiplier: "×0,5" },
      { scenarioId: "vscode-basics.guided", label: "Guided", description: "Schritt für Schritt lernen", icon: RouteIcon, multiplier: "×1,0" },
      { scenarioId: "vscode-basics.challenge", label: "Challenge", description: "Ziel selbstständig erreichen", icon: Target, multiplier: "×2,0" },
      { scenarioId: "vscode-shortcuts.challenge", label: "Speed Challenge", description: "Datei per Shortcuts in 30 Sekunden bearbeiten", icon: Timer, multiplier: "×2,0" },
    ],
  },
  {
    id: "github-basics", scenarioId: null, title: "GitHub – Grundlagen", description: "Repositories, Branches, Remotes, Pull Requests und die Zusammenarbeit auf GitHub als eigenes Werkzeug kennenlernen.", icon: Github, available: true, label: "Source Control Platform · 3 Modi", modes: [
      { scenarioId: "source-control-platform-basics.explore", label: "Explore", description: "Repository-Oberfläche frei erkunden", icon: Search, multiplier: "×0,5" },
      { scenarioId: "source-control-platform-basics.guided", label: "Guided", description: "Pull Request Schritt für Schritt verstehen", icon: RouteIcon, multiplier: "×1,0" },
      { scenarioId: "source-control-platform-basics.challenge", label: "Challenge", description: "Reviewbaren Pull Request selbst herstellen", icon: Target, multiplier: "×2,0" },
    ],
  },
  {
    id: "github-copilot-basics", scenarioId: null, title: "GitHub Copilot – Grundlagen", description: "Chat, Inline-Vorschläge, Kontext, Arbeitsmodi, Modellauswahl und kontrollierte Übernahme von KI-Vorschlägen kennenlernen.", icon: Bot, available: true, label: "AI Coding Assistant · 3 Modi", modes: [
      { scenarioId: "copilot-basics.explore", label: "Explore", description: "Copilot-Funktionen frei untersuchen", icon: Search, multiplier: "×0,5" },
      { scenarioId: "copilot-basics.guided", label: "Guided", description: "Copilot kontrolliert Schritt für Schritt einsetzen", icon: RouteIcon, multiplier: "×1,0" },
      { scenarioId: "copilot-basics.challenge", label: "Challenge", description: "Sicheren Endzustand selbstständig herstellen", icon: Target, multiplier: "×2,0" },
    ],
  },
  {
    id: "cli-agents", scenarioId: null, title: "CLI-Agenten kennenlernen", description: "Claude Code in einer vollständig simulierten Terminalumgebung sicher einsetzen: Auftrag und Plan kontrollieren, Berechtigungen bewusst entscheiden, Fehler korrigieren und den Endzustand mit Tests selbst verifizieren.", icon: Terminal, available: true, label: "CLI Agent · 3 Modi", modes: [
      { scenarioId: "claude-code-basics.explore", label: "Explore", description: "Kontrollflächen und Risiken frei untersuchen", icon: Search, multiplier: "×0,5" },
      { scenarioId: "claude-code-basics.guided", label: "Guided", description: "Riskanten Entwurf korrigieren und prüfen", icon: RouteIcon, multiplier: "×1,0" },
      { scenarioId: "claude-code-basics.challenge", label: "Challenge", description: "Sicheren getesteten Endzustand herstellen", icon: Target, multiplier: "×2,0" },
    ],
  },
];

const workflowTrainings: TrainingCardModel[] = [
  {
    id: "developer-workflow-basics", scenarioId: null, title: "VS Code, Git & GitHub Copilot – Zusammenspiel", description: "Voraussetzungen: VS-Code-, Git- und Copilot-Grundlagen. Verbinde die Werkzeuge in einem realistischen Work Item: Branch und Working Tree prüfen, Copilot mit bewusstem Kontext einsetzen, Diff und Prüfung kontrollieren, selektiv stagen, committen und einen handoff-fähigen Zustand herstellen.", icon: GitBranch, available: true, label: "AI Workflow · 3 Modi · Voraussetzungen: VS Code · Git · Copilot", modes: [
      { scenarioId: "developer-workflow-basics.explore", label: "Explore", description: "Werkzeuggrenzen und Übergaben frei erkunden", icon: Search, multiplier: "×0,5" },
      { scenarioId: "git-basics", label: "Guided", description: "Work Item kontrolliert bis zum Handoff führen", icon: RouteIcon, multiplier: "×1,0" },
      { scenarioId: "developer-workflow-basics.challenge", label: "Challenge", description: "Handoff-ready Endzustand selbstständig herstellen", icon: Target, multiplier: "×2,0" },
    ],
  },
  {
    id: "research-workflow", scenarioId: null, title: "Mit KI recherchieren und Quellen prüfen", description: "Eine Recherche als eigenen KI-Workflow üben: Auftrag formulieren, Ergebnis erzeugen, Quellen prüfen und das Resultat fachlich bewerten.", icon: Search, available: true, label: "AI Workflow · 3 Modi", modes: [
      { scenarioId: "research-workflow.explore", label: "Explore", description: "Recherche-Werkzeuge frei erkunden", icon: Search, multiplier: "×0,5" },
      { scenarioId: "research-workflow.guided", label: "Guided", description: "Recherche Schritt für Schritt durchführen", icon: RouteIcon, multiplier: "×1,0" },
      { scenarioId: "research-workflow.challenge", label: "Challenge", description: "Recherche-Ergebnis selbstständig absichern", icon: Target, multiplier: "×2,0" },
    ],
  },
  {
    id: "html-page-workflow", scenarioId: null, title: "HTML-Seite mit KI erstellen und iterativ verbessern", description: "Eine Seite als eigenen Workflow erzeugen, sichtbar weiterentwickeln, zwischen Vorschau und Quelltext wechseln und unbeabsichtigte Änderungen erkennen.", icon: Code2, available: true, label: "AI Workflow · 3 Modi", modes: [
      { scenarioId: "html-page-workflow.explore", label: "Explore", description: "Seite und Ergebnisansicht frei erkunden", icon: Search, multiplier: "×0,5" },
      { scenarioId: "html-page-workflow.guided", label: "Guided", description: "HTML-Seite Schritt für Schritt entwickeln", icon: RouteIcon, multiplier: "×1,0" },
      { scenarioId: "html-page-workflow.challenge", label: "Challenge", description: "Änderungen selbstständig prüfen und korrigieren", icon: Target, multiplier: "×2,0" },
    ],
  },
  {
    id: "table-data-workflow", scenarioId: null, title: "Tabellendaten mit KI analysieren und prüfen", description: "Tabellendaten als KI-Workflow untersuchen, Bereinigungsannahmen nachvollziehen, Zwischenwerte prüfen und das Ergebnis vor der Freigabe plausibilisieren.", icon: Search, available: true, label: "AI Workflow · 3 Modi", modes: [
      { scenarioId: "table-data-workflow.explore", label: "Explore", description: "Daten, Analyse und Kontrollpunkte frei erkunden", icon: Search, multiplier: "×0,5" },
      { scenarioId: "table-data-workflow.guided", label: "Guided", description: "Tabellenanalyse Schritt für Schritt prüfen", icon: RouteIcon, multiplier: "×1,0" },
      { scenarioId: "table-data-workflow.challenge", label: "Challenge", description: "Plausibilitätsfehler selbstständig erkennen und verifizieren", icon: Target, multiplier: "×2,0" },
    ],
  },
];

const aiWorkflowModuleLine = getModuleLineById(moduleLineCatalog, "ai-workflows-in-practice");
const aiWorkflowTrainings = aiWorkflowModuleLine.moduleIds.map((moduleId) => {
  const training = workflowTrainings.find(({ id }) => id === moduleId);
  if (!training) {
    throw new Error(`Missing dashboard training card for module line module: ${moduleId}`);
  }
  return training;
});

const otherTrainings: TrainingCardModel[] = [
  {
    id: "m365-copilot-basics", scenarioId: null, title: "M365 Copilot Grundlagen", description: "Den Microsoft-365-Copilot-Chat mit freigegebenem Work-Kontext, klaren Arbeitsaufträgen, Quellenprüfung und expliziter menschlicher Freigabe einsetzen. Alle Inhalte sind synthetisch.", icon: Bot, available: true, label: "Office Assistant · 3 Modi", modes: [
      { scenarioId: "m365-copilot-basics.explore", label: "Explore", description: "Chatfläche, Grounding und Kontrollpfad erkunden", icon: Search, multiplier: "×0,5" },
      { scenarioId: "m365-copilot-basics.guided", label: "Guided", description: "Work-Kontext → Auftrag → Freigabe durchlaufen", icon: RouteIcon, multiplier: "×1,0" },
      { scenarioId: "m365-copilot-basics.challenge", label: "Challenge", description: "Freigabefähigen Endzustand selbst herstellen", icon: Target, multiplier: "×2,0" },
    ],
  },
];

function Dashboard() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-6">
          <GraduationCap className="h-5 w-5 text-accent" />
          <span className="text-sm font-semibold tracking-tight text-foreground">AI Training Lab</span>
          <div className="ml-auto"><AccountMenu /></div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Meine Trainings</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">Sieh zuerst, was du bereits nachgewiesen hast und wo du exakt weiterarbeiten kannst. Den vollständigen Trainingskatalog findest du darunter für die gezielte Auswahl weiterer Lernmodule.</p>
        <DashboardLearningOverview />
        <div className="mt-12 border-t border-border pt-8"><h2 className="text-xl font-semibold tracking-tight text-foreground">Alle Trainings</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">Lerne Werkzeuge einzeln kennen und wende sie anschließend in gemeinsamen Workflows an.</p></div>
        <TrainingSection title="Werkzeuge einzeln kennenlernen" description="Jeder Grundkurs konzentriert sich auf genau ein Werkzeug und seine eigenen Konzepte." trainings={toolTrainings} />
        <TrainingSection title={aiWorkflowModuleLine.title} description={aiWorkflowModuleLine.description} trainings={aiWorkflowTrainings} />
        <TrainingSection title="Weitere Lernbereiche" description="Weitere Technologien und Arbeitskontexte werden nach demselben Prinzip als eigenständige Lernmodule ergänzt." trainings={otherTrainings} />
        <section className="mt-6" aria-labelledby="use-case-guidance-heading"><article className="min-w-0 rounded-xl border border-border bg-card p-5 transition-colors hover:border-ring/60"><div className="flex min-w-0 items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15"><Lightbulb className="h-4 w-4 text-accent" /></span><span className="text-[11px] uppercase tracking-wider text-muted-foreground">Aktion · kein Training</span></div><h2 id="use-case-guidance-heading" className="mt-3 text-base font-semibold text-foreground">Eigenes Vorhaben einordnen</h2><p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">Beschreibe eine Aufgabe aus deinem Arbeitsalltag. Die Plattform hilft dir anschließend, das Vorhaben als Lern- und Umsetzungsweg einzuordnen.</p><div className="mt-4"><Link to="/use-case-guidance" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-ring/60 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card">Vorhaben beschreiben<ArrowRight className="h-4 w-4" /></Link></div></article></section>
      </main>
    </div>
  );
}

function TrainingSection({ title, description, trainings }: { title: string; description: string; trainings: TrainingCardModel[] }) {
  return <section className="mt-10"><div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="text-sm font-semibold text-foreground">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{description}</p></div><span className="hidden text-[11px] text-muted-foreground sm:block">{trainings.length} Module</span></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{trainings.map((training) => <TrainingCard key={training.id} training={training} />)}</div></section>;
}

function TrainingCard({ training }: { training: TrainingCardModel }) {
  const Icon = training.icon;
  const progress = useStoredProgressPercent(training.scenarioId);
  return <article className="min-w-0 rounded-xl border border-border bg-card p-5 transition-colors hover:border-ring/60"><div className="flex min-w-0 items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15"><Icon className="h-4 w-4 text-accent" /></span>{training.label && <span className="min-w-0 text-[11px] uppercase tracking-wider text-muted-foreground">{training.label}</span>}</div><h3 className="mt-3 text-base font-semibold text-foreground">{training.title}</h3><p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{training.description}</p>{training.modes?.length ? <div className="mt-4 grid gap-2">{training.modes.map((mode) => { const ModeIcon = mode.icon; return <Link key={mode.scenarioId} to="/train/$scenarioId" params={{ scenarioId: mode.scenarioId }} className="group flex min-h-11 items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 transition-colors hover:border-ring/60 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10"><ModeIcon className="h-3.5 w-3.5 text-accent" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-foreground">{mode.label}</span><span className="block text-[11px] leading-snug text-muted-foreground">{mode.description}</span></span><span className="shrink-0 text-[11px] font-medium text-muted-foreground">{mode.multiplier}</span><ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></Link>; })}</div> : <div className="mt-4 flex items-center justify-between border-t border-border pt-3"><span className="text-xs text-muted-foreground">{progress > 0 ? `${progress}% abgeschlossen` : "Noch nicht begonnen"}</span>{training.available && training.scenarioId ? <Link to="/train/$scenarioId" params={{ scenarioId: training.scenarioId }} className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">{progress > 0 ? "Fortsetzen" : "Starten"}<ArrowRight className="h-3.5 w-3.5" /></Link> : <span className="text-xs text-muted-foreground">In Kürze</span>}</div>}</article>;
}
