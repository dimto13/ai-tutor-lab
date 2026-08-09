import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { GraduationCap, LogOut, Eye, EyeOff } from "lucide-react";
import { TrainingProvider, useTraining } from "@/state/trainingStore";
import { RuntimeWorkspace } from "@/components/workspace/RuntimeWorkspace";
import { GuidePanel } from "@/components/training/GuidePanel";
import { CompletionScreen } from "@/components/training/CompletionScreen";
import { HighlightOverlay } from "@/components/overlay/HighlightOverlay";

export const Route = createFileRoute("/training/$scenarioId")({
  head: () => ({
    meta: [
      { title: "Interaktives Training – AI Training Lab" },
      {
        name: "description",
        content:
          "Interaktives Training in einer simulierten Arbeitsumgebung mit KI-Tutor und automatischer Validierung.",
      },
      { property: "og:title", content: "Interaktives Training – AI Training Lab" },
      {
        property: "og:description",
        content: "Interaktives Training mit Explore-, Guided- und Challenge-Modus.",
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
  const {
    scenario,
    mode,
    progress,
    percent,
    completedCount,
    isFinished,
    isChallengeFailed,
    isReady,
    helpLevel,
    scoreMultiplier,
  } = useTraining();
  const [highlightsOn, setHighlightsOn] = useState(true);
  const step = scenario.steps.find((s) => s.id === progress.activeStepId);
  const stepNumber = step
    ? scenario.steps.findIndex((s) => s.id === step.id) + 1
    : scenario.steps.length;
  const exploreTotal = scenario.exploreTargets?.length ?? 0;

  return (
    <div
      className={`flex h-screen flex-col overflow-hidden bg-background text-foreground ${isReady ? "" : "pointer-events-none"}`}
      aria-busy={!isReady}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {isReady ? "Training bereit" : "Training wird geladen"}
      </p>

      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-border bg-panel px-4">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <GraduationCap className="h-4.5 w-4.5 text-accent" />
          AI Training Lab
        </Link>
        <span className="h-4 w-px bg-border" />
        <span className="truncate text-[13px] text-muted-foreground">{scenario.title}</span>
        <span className="rounded border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
          {mode} ×{scoreMultiplier}
        </span>
        <span className="h-4 w-px bg-border" />
        <span className="whitespace-nowrap text-[13px] text-foreground">
          {mode === "explore"
            ? `${completedCount} von ${exploreTotal} erkundet`
            : mode === "challenge"
              ? isFinished
                ? "Challenge erfüllt"
                : isChallengeFailed
                  ? "Challenge fehlgeschlagen"
                  : "Endzustand offen"
              : `Schritt ${Math.min(stepNumber, scenario.steps.length)} von ${scenario.steps.length}`}
        </span>
        <div className="flex w-40 items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground">{percent} %</span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {mode === "guided" ? (
            <button
              onClick={() => setHighlightsOn((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
              title="Visuelle Führung ein-/ausschalten"
            >
              {highlightsOn ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              Highlights
            </button>
          ) : null}
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
          <RuntimeWorkspace key={scenario.id} />
          <GuidePanel />
        </div>
      )}

      {!isFinished && mode === "guided" && highlightsOn && step?.highlightTarget ? (
        <HighlightOverlay
          targetId={step.highlightTarget}
          runtimeAdapterId={scenario.environment?.runtimeAdapterId}
          integrationRuntimeAdapterIds={scenario.environment?.integrationRuntimeAdapterIds}
          tooltip={step.highlightTooltip}
          strong={helpLevel >= 3}
        />
      ) : null}

      <p className="sr-only">{completedCount} Fortschrittseinheiten abgeschlossen</p>
    </div>
  );
}
