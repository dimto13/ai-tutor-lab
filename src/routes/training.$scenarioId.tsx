import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { GraduationCap, LogOut, Eye, EyeOff } from "lucide-react";
import { TrainingProvider, useTraining } from "@/state/trainingStore";
import { Workspace } from "@/components/workspace/Workspace";
import { GuidePanel } from "@/components/training/GuidePanel";
import { CompletionScreen } from "@/components/training/CompletionScreen";
import { HighlightOverlay } from "@/components/overlay/HighlightOverlay";

export const Route = createFileRoute("/training/$scenarioId")({
  head: () => ({
    meta: [
      { title: "Interaktives Training – AI Training Lab" },
      {
        name: "description",
        content: "Interaktives Training in einer simulierten Arbeitsumgebung mit KI-Tutor und automatischer Validierung.",
      },
      { property: "og:title", content: "Interaktives Training – AI Training Lab" },
      {
        property: "og:description",
        content: "Schritt-für-Schritt geführtes Training mit KI-Tutor und automatischer Validierung.",
      },
    ],
  }),
  component: TrainingRoute,
});

function TrainingRoute() {
  const { scenarioId } = Route.useParams();
  return (
    <TrainingProvider scenarioId={scenarioId}>
      <TrainingLayout />
    </TrainingProvider>
  );
}

function TrainingLayout() {
  const { scenario, progress, percent, completedCount, isFinished, helpLevel } = useTraining();
  const [highlightsOn, setHighlightsOn] = useState(true);
  const step = scenario.steps.find((s) => s.id === progress.activeStepId);
  const stepNumber = step ? scenario.steps.findIndex((s) => s.id === step.id) + 1 : scenario.steps.length;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-border bg-panel px-4">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <GraduationCap className="h-4.5 w-4.5 text-accent" />
          AI Training Lab
        </Link>
        <span className="h-4 w-px bg-border" />
        <span className="truncate text-[13px] text-muted-foreground">{scenario.title}</span>
        <span className="h-4 w-px bg-border" />
        <span className="whitespace-nowrap text-[13px] text-foreground">
          Schritt {Math.min(stepNumber, scenario.steps.length)} von {scenario.steps.length}
        </span>
        <div className="flex w-40 items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-[11px] text-muted-foreground">{percent} %</span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setHighlightsOn((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
            title="Visuelle Führung ein-/ausschalten"
          >
            {highlightsOn ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            Highlights
          </button>
          <span className="text-[13px] text-muted-foreground">Maria Schmidt</span>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[12px] text-foreground transition-colors hover:border-ring hover:bg-white/5"
          >
            <LogOut className="h-3.5 w-3.5" /> Training verlassen
          </Link>
        </div>
      </header>

      {isFinished ? (
        <CompletionScreen />
      ) : (
        <div className="flex min-h-0 flex-1">
          <Workspace />
          <GuidePanel />
        </div>
      )}

      {!isFinished && highlightsOn && step?.highlightTarget ? (
        <HighlightOverlay
          targetId={step.highlightTarget}
          tooltip={step.highlightTooltip}
          strong={helpLevel >= 3}
        />
      ) : null}

      <p className="sr-only">{completedCount} Schritte abgeschlossen</p>
    </div>
  );
}
