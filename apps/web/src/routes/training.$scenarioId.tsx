import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SCORE_MODE_MULTIPLIER } from "@ai-train-lab/training-engine";
import {
  BookOpen,
  Clock3,
  GraduationCap,
  LogOut,
  Eye,
  EyeOff,
  Monitor,
  RotateCcw,
  Target,
} from "lucide-react";
import { AccountMenu } from "@/auth/AccountMenu";
import { TrainingProvider, useTraining } from "@/state/trainingStore";
import { RuntimeWorkspace } from "@/components/workspace/RuntimeWorkspace";
import { GuidePanel } from "@/components/training/GuidePanel";
import { GuidedStepNavigation } from "@/components/training/GuidedStepNavigation";
import { CompletionScreen } from "@/components/training/CompletionScreen";
import { HighlightOverlay } from "@/components/overlay/HighlightOverlay";
import { getScenario, getScenariosForModule } from "@/scenarios";

const DESKTOP_LAYOUT_MEDIA_QUERY = "(min-width: 64rem)";
const TUTOR_ATTENTION_TIMEOUT_MS = 2500;

export const Route = createFileRoute("/training/$scenarioId")({
  loader: ({ params: { scenarioId } }) => {
    if (getScenario(scenarioId)) return;
    console.warn(`[training-route] Unbekannte Szenario-ID: ${scenarioId}`);
    throw notFound();
  },
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
  notFoundComponent: TrainingNotFound,
});

function TrainingNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section
        aria-labelledby="training-not-found-title"
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-xl"
      >
        <p className="text-sm font-semibold text-accent">404</p>
        <h1 id="training-not-found-title" className="mt-2 text-xl font-semibold text-foreground">
          Training nicht gefunden
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Das angeforderte Training wurde nicht gefunden oder ist nicht mehr verfügbar.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Zurück zur Trainingsübersicht
        </Link>
      </section>
    </main>
  );
}

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
  const retryAfterTimeout = isChallengeFailed;

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
  const { scenario, recommendGuidedAfterChallenge } = useTraining();
  const goal = scenario.steps[0];
  const timeLimit = scenario.timeLimitSeconds ?? 0;
  const guidedScenario = scenario.moduleId
    ? getScenariosForModule(scenario.moduleId).find(
        (candidate) => (candidate.mode ?? "guided") === "guided",
      )
    : undefined;
  const showGuidedRecommendation =
    retryAfterTimeout && recommendGuidedAfterChallenge && Boolean(guidedScenario);

  return (
    <div
      data-platform-ui="challenge-briefing"
      className={`platform-ui flex min-h-screen flex-col bg-background text-foreground ${isReady ? "" : "pointer-events-none"}`}
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

          {showGuidedRecommendation && guidedScenario ? (
            <div
              data-testid="guided-after-challenge-recommendation"
              role="region"
              aria-label="Guided-Modus empfohlen"
              className="mt-4 rounded-xl border border-accent/40 bg-accent/10 p-4"
            >
              <p className="text-sm font-semibold text-foreground">Guided-Modus empfohlen</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Nach mehreren fehlgeschlagenen Versuchen kann dir der geführte Modus die nötigen
                Schritte noch einmal zeigen. Du kannst stattdessen weiterhin direkt einen neuen
                Challenge-Versuch starten.
              </p>
              <Link
                to="/training/$scenarioId"
                params={{ scenarioId: guidedScenario.id }}
                className="mt-3 inline-flex items-center justify-center rounded-md border border-accent/50 px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent/10"
              >
                Guided-Modus öffnen
              </Link>
            </div>
          ) : null}

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
    challengeRemainingSeconds,
    recovery,
    performGuidedRecovery,
  } = useTraining();
  const [highlightsOn, setHighlightsOn] = useState(true);
  const [mobileSurface, setMobileSurface] = useState<"workspace" | "guide">("workspace");
  const [attentionTarget, setAttentionTarget] = useState<string | null>(null);
  const [attentionRun, setAttentionRun] = useState(0);
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

  useEffect(() => {
    setAttentionTarget(null);
  }, [step?.id, step?.highlightTarget]);

  useEffect(() => {
    if (!attentionTarget) return;
    const timeout = window.setTimeout(() => setAttentionTarget(null), TUTOR_ATTENTION_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [attentionTarget, attentionRun]);

  const showCurrentTarget = () => {
    if (!step?.highlightTarget) return;
    setMobileSurface("workspace");
    setAttentionTarget(step.highlightTarget);
    setAttentionRun((run) => run + 1);
  };

  const overlayTarget = attentionTarget ?? highlightTarget;
  const showOverlay = Boolean(attentionTarget) || highlightsOn;

  return (
    <div
      className={`flex h-screen flex-col overflow-hidden bg-background text-foreground ${isReady ? "" : "pointer-events-none"}`}
      aria-busy={!isReady}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {isReady ? "Training bereit" : "Training wird geladen"}
      </p>

      <header
        data-platform-ui="meta-navigation"
        className="platform-ui flex h-12 min-w-0 shrink-0 items-center gap-2 border-b border-border bg-panel px-2 sm:gap-3 sm:px-4"
      >
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
          {mode} ×{SCORE_MODE_MULTIPLIER[mode]}
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
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
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
            <>
              <button
                type="button"
                data-testid="show-current-target"
                onClick={showCurrentTarget}
                disabled={!step?.highlightTarget}
                aria-label={
                  step?.highlightTarget
                    ? "Aktuelles Lernziel zeigen"
                    : "Für diesen Schritt ist kein visuelles Ziel verfügbar"
                }
                title={
                  step?.highlightTarget
                    ? "Aktuelles Lernziel zeigen"
                    : "Für diesen Schritt ist kein visuelles Ziel verfügbar"
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Target className="h-3.5 w-3.5" aria-hidden="true" />
                Ziel zeigen
              </button>
              <button
                type="button"
                onClick={() => setHighlightsOn((v) => !v)}
                className="hidden items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground lg:inline-flex"
                title="Visuelle Führung ein-/ausschalten"
              >
                {highlightsOn ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                Highlights
              </button>
            </>
          ) : null}
          <AccountMenu compact />
          <Link
            to="/"
            aria-label="Training verlassen"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:border-ring hover:bg-muted xl:w-auto xl:gap-1.5 xl:px-2.5"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden text-[12px] xl:inline">Training verlassen</span>
          </Link>
        </div>
      </header>

      {!isFinished && mode === "guided" ? <GuidedStepNavigation /> : null}

      {!isFinished && mode === "guided" && recovery ? (
        <div
          data-testid="guided-recovery"
          data-platform-ui="guided-recovery"
          className="platform-ui flex shrink-0 flex-col gap-2 border-b border-warning/40 bg-warning/10 px-3 py-2.5 sm:flex-row sm:items-center sm:px-4"
          role="region"
          aria-label="Schritt wiederherstellen"
          aria-live="polite"
        >
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p id="guided-recovery-message" className="text-[12px] leading-relaxed text-foreground">
              {recovery.message}
            </p>
          </div>
          <button
            type="button"
            data-testid="guided-recovery-primary-action"
            data-primary-learning-action="true"
            data-primary-action-kind="platform"
            aria-describedby="guided-recovery-message"
            onClick={() => void performGuidedRecovery()}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-warning/60 bg-background/70 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-background"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {recovery.label}
          </button>
        </div>
      ) : null}

      {!isFinished &&
      mode === "challenge" &&
      scenario.timeLimitSeconds !== undefined &&
      mobileSurface === "workspace" ? (
        <div
          data-platform-ui="mobile-challenge-status"
          className="platform-ui flex shrink-0 items-center gap-2 border-b border-warning/30 bg-warning/10 px-3 py-2 lg:hidden"
        >
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
        <div data-platform-ui="completion" className="platform-ui contents">
          <CompletionScreen />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div
            className={`${mobileSurface === "workspace" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 lg:flex`}
          >
            <RuntimeWorkspace key={scenario.id} />
          </div>
          <div
            data-platform-ui="guide"
            className={`platform-ui ${mobileSurface === "guide" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 lg:flex lg:flex-none ${recovery ? "[&_[data-primary-learning-action=true]]:hidden" : ""}`}
          >
            <GuidePanel />
          </div>
        </div>
      )}

      {!isFinished &&
      mode === "guided" &&
      showOverlay &&
      mobileSurface === "workspace" &&
      overlayTarget ? (
        <HighlightOverlay
          key={`${overlayTarget}:${attentionRun}`}
          targetId={overlayTarget}
          runtimeAdapterId={scenario.environment?.runtimeAdapterId}
          integrationRuntimeAdapterIds={scenario.environment?.integrationRuntimeAdapterIds}
          tooltip={
            attentionTarget
              ? "Hier findest du das aktuelle Lernziel."
              : failureTarget
                ? feedback?.message
                : step?.highlightTooltip
          }
          strong={Boolean(attentionTarget) || Boolean(failureTarget) || helpLevel >= 3}
        />
      ) : null}

      <p className="sr-only">{completedCount} Fortschrittseinheiten abgeschlossen</p>
    </div>
  );
}
