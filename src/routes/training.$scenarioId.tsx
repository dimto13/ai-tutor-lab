import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BookOpen, GraduationCap, LogOut, Eye, EyeOff, Monitor } from "lucide-react";
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
  const [mobileSurface, setMobileSurface] = useState<"workspace" | "guide">("workspace");
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

      <header className="flex h-12 min-w-0 shrink-0 items-center gap-2 border-b border-border bg-panel px-2 sm:gap-3 sm:px-4">
        <Link
          to="/"
          aria-label="AI Training Lab – zurück zum Dashboard"
          className="flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <GraduationCap className="h-4.5 w-4.5 text-accent" />
          <span className="hidden sm:inline">AI Training Lab</span>
        </Link>
        <span className="hidden h-4 w-px shrink-0 bg-border sm:block" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
          {scenario.title}
        </span>
        <span className="hidden shrink-0 rounded border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent md:inline-flex">
          {mode} ×{scoreMultiplier}
        </span>
        <span className="hidden h-4 w-px shrink-0 bg-border xl:block" />
        <span className="hidden shrink-0 whitespace-nowrap text-[13px] text-foreground xl:inline">
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
        <div className="hidden w-40 shrink-0 items-center gap-2 xl:flex">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground">{percent} %</span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setMobileSurface((surface) => (surface === "workspace" ? "guide" : "workspace"))
            }
            aria-label={
              mobileSurface === "workspace" ? "Guide anzeigen" : "Arbeitsbereich anzeigen"
            }
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-ring hover:text-foreground lg:hidden"
          >
            {mobileSurface === "workspace" ? (
              <BookOpen className="h-4 w-4" />
            ) : (
              <Monitor className="h-4 w-4" />
            )}
          </button>
          {mode === "guided" ? (
            <button
              onClick={() => setHighlightsOn((v) => !v)}
              className="hidden items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground lg:inline-flex"
              title="Visuelle Führung ein-/ausschalten"
            >
              {highlightsOn ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              Highlights
            </button>
          ) : null}
          <span className="hidden text-[13px] text-muted-foreground 2xl:inline">Maria Schmidt</span>
          <Link
            to="/"
            aria-label="Training verlassen"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:border-ring hover:bg-white/5 xl:w-auto xl:gap-1.5 xl:px-2.5"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden text-[12px] xl:inline">Training verlassen</span>
          </Link>
        </div>
      </header>

      {isFinished ? (
        <CompletionScreen />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div
            className={`${mobileSurface === "workspace" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 lg:flex`}
          >
            <Workspace key={scenario.id} />
          </div>
          <div
            className={`${mobileSurface === "guide" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 lg:flex lg:flex-none`}
          >
            <GuidePanel />
          </div>
        </div>
      )}

      {!isFinished &&
      mode === "guided" &&
      highlightsOn &&
      mobileSurface === "workspace" &&
      step?.highlightTarget ? (
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
