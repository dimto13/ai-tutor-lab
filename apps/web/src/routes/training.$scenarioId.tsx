import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Clock3,
  GraduationCap,
  LogOut,
  Eye,
  EyeOff,
  Monitor,
  Target,
} from "lucide-react";
import { AccountMenu } from "@/auth/AccountMenu";
import { TrainingProvider, useTraining } from "@/state/trainingStore";
import { RuntimeWorkspace } from "@/components/workspace/RuntimeWorkspace";
import { GuidePanel } from "@/components/training/GuidePanel";
import { CompletionScreen } from "@/components/training/CompletionScreen";
import { HighlightOverlay } from "@/components/overlay/HighlightOverlay";

const DESKTOP_LAYOUT_MEDIA_QUERY = "(min-width: 64rem)";

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
      <TrainingEntry />
    </TrainingProvider>
  );
}

function TrainingEntry() {
  const { scenario, mode, restart, isReady, isChallengeFailed } = useTraining();
  const requiresBriefing = mode === "challenge" && scenario.timeLimitSeconds !== undefined;
  const [attemptStarted, setAttemptStarted] = useState(!requiresBriefing);
  const retryAfterTimeout = attemptStarted && isChallengeFailed;

  if (requiresBriefing && (!attemptStarted || isChallengeFailed)) {
    return (
      <TimedChallengeBriefing
        isReady={isReady}
        retryAfterTimeout={retryAfterTimeout}
        onStart={() => {
          restart();
          setAttemptStarted(true);
        }}
      />
    );
  }

  return <TrainingLayout />;
}

function TimedChallengeBriefing({
  isReady,
  retryAfterTimeout,
  onStart,
}: {
  isReady: boolean;
  retryAfterTimeout: boolean;
  onStart(): void;
}) {
  const { scenario } = useTraining();
  const goal = scenario.steps[0];
  const timeLimit = scenario.timeLimitSeconds ?? 0;

  return (
    <div
      className={`flex min-h-screen flex-col bg-background text-foreground ${isReady ? "" : "pointer-events-none"}`}
      aria-busy={!isReady}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {isReady ? "Training bereit" : "Training wird geladen"}
      </p>

      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-panel px-4 sm:px-6">
        <Link
          to="/"
          aria-label="AI Training Lab – zurück zum Dashboard"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <GraduationCap className="h-4.5 w-4.5 text-accent" />
          <span>AI Training Lab</span>
        </Link>
        <span className="h-4 w-px bg-border" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
          {scenario.title}
        </span>
        <AccountMenu compact />
        <span className="rounded border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
          Challenge
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <section className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-7">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Target className="h-4 w-4 text-accent" />
            {retryAfterTimeout ? "Neuer Versuch" : "Aufgabenbriefing"}
          </div>

          <h1 className="mt-3 text-xl font-semibold leading-snug text-foreground sm:text-2xl">
            {goal?.title ?? scenario.title}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {retryAfterTimeout
              ? "Die Zeit des letzten Versuchs ist abgelaufen. Lies die Aufgabe noch einmal in Ruhe. Der neue Countdown beginnt erst, wenn du den Start bestätigst."
              : scenario.description}
          </p>

          {goal ? (
            <div className="mt-5 rounded-xl border border-accent/30 bg-accent/10 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                Deine Aufgabe
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-foreground">{goal.instruction}</p>
            </div>
          ) : null}

          <div className="mt-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
            <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-semibold text-foreground">{timeLimit} Sekunden Zeit</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Die Zeit läuft noch nicht. Sie startet erst mit deiner Bestätigung unten. Danach
                öffnet sich der Arbeitsbereich und die Aufgabe bleibt auf kleineren Bildschirmen
                kompakt sichtbar.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={!isReady}
            onClick={onStart}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Clock3 className="h-4 w-4" />
            {retryAfterTimeout
              ? `Neuen Versuch starten · ${timeLimit} Sekunden`
              : `Aufgabe verstanden · ${timeLimit} Sekunden starten`}
          </button>

          <Link
            to="/"
            className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
          >
            Zurück zur Trainingsübersicht
          </Link>
        </section>
      </main>
    </div>
  );
}

function formatChallengeTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
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
    feedback,
    helpLevel,
    scoreMultiplier,
    challengeRemainingSeconds,
  } = useTraining();
  const [highlightsOn, setHighlightsOn] = useState(true);
  const [mobileSurface, setMobileSurface] = useState<"workspace" | "guide">("workspace");
  const step = scenario.steps.find((s) => s.id === progress.activeStepId);
  const failureTarget = feedback?.kind === "error" ? step?.onFailure?.markTarget : undefined;
  const highlightTarget = failureTarget ?? step?.highlightTarget;
  const stepNumber = step
    ? scenario.steps.findIndex((s) => s.id === step.id) + 1
    : scenario.steps.length;
  const exploreTotal = scenario.exploreTargets?.length ?? 0;
  const challengeGoal = scenario.steps[0];

  useEffect(() => {
    const desktopLayout = window.matchMedia(DESKTOP_LAYOUT_MEDIA_QUERY);
    const restoreWorkspaceOnDesktop = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) setMobileSurface("workspace");
    };
    restoreWorkspaceOnDesktop(desktopLayout);
    desktopLayout.addEventListener("change", restoreWorkspaceOnDesktop);
    return () => desktopLayout.removeEventListener("change", restoreWorkspaceOnDesktop);
  }, []);

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
          <AccountMenu compact />
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

      {!isFinished &&
      mode === "challenge" &&
      scenario.timeLimitSeconds !== undefined &&
      mobileSurface === "workspace" ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-warning/30 bg-warning/10 px-3 py-2 lg:hidden">
          <Target className="h-4 w-4 shrink-0 text-warning" />
          <p className="min-w-0 flex-1 truncate text-[12px] text-foreground">
            <span className="font-semibold">Aufgabe:</span> {challengeGoal?.instruction}
          </p>
          <span className="shrink-0 font-mono text-xs font-semibold text-foreground">
            {formatChallengeTime(challengeRemainingSeconds ?? scenario.timeLimitSeconds)}
          </span>
          <button
            type="button"
            onClick={() => setMobileSurface("guide")}
            className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] text-foreground"
          >
            Details
          </button>
        </div>
      ) : null}

      {isFinished ? (
        <CompletionScreen />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div
            className={`${mobileSurface === "workspace" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 lg:flex`}
          >
            <RuntimeWorkspace key={scenario.id} />
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
      highlightTarget ? (
        <HighlightOverlay
          targetId={highlightTarget}
          runtimeAdapterId={scenario.environment?.runtimeAdapterId}
          integrationRuntimeAdapterIds={scenario.environment?.integrationRuntimeAdapterIds}
          tooltip={failureTarget ? feedback?.message : step?.highlightTooltip}
          strong={Boolean(failureTarget) || helpLevel >= 3}
        />
      ) : null}

      <p className="sr-only">{completedCount} Fortschrittseinheiten abgeschlossen</p>
    </div>
  );
}
