import {
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  Focus,
  RotateCcw,
  SkipForward,
} from "lucide-react";
import { TutorAttentionOverlay } from "@/components/overlay/TutorAttentionOverlay";
import { requestTutorAttention } from "@/components/overlay/tutorAttention";
import { useTraining } from "@/state/trainingStore";

export function GuidedStepNavigation() {
  const { scenario, progress, isGuidedReplay, guidedNavigationPending, navigateToGuidedStep } =
    useTraining();

  const furthestStepId =
    scenario.steps.find((step) => {
      const status = progress.statuses[step.id];
      return status === "ACTIVE" || status === "VALIDATION_FAILED";
    })?.id ?? null;
  const displayedStepId = progress.activeStepId;
  const displayedStep = scenario.steps.find((step) => step.id === displayedStepId) ?? null;
  const displayedStepNumber = displayedStep
    ? scenario.steps.findIndex((step) => step.id === displayedStep.id) + 1
    : null;

  const reachableStepIds = scenario.steps
    .filter((step) => progress.statuses[step.id] === "COMPLETED" || step.id === furthestStepId)
    .map((step) => step.id);
  const displayedReachableIndex = displayedStepId ? reachableStepIds.indexOf(displayedStepId) : -1;
  const previousStepId =
    displayedReachableIndex > 0 ? reachableStepIds[displayedReachableIndex - 1] : undefined;
  const nextStepId =
    displayedReachableIndex >= 0 && displayedReachableIndex < reachableStepIds.length - 1
      ? reachableStepIds[displayedReachableIndex + 1]
      : undefined;

  return (
    <>
      <nav
        data-testid="guided-step-navigation"
        data-platform-ui="guided-step-navigation"
        className="platform-ui shrink-0 border-b border-border bg-background px-2 py-1.5 sm:px-4"
        aria-label="Guided-Schritte und Wiederholung"
        aria-busy={guidedNavigationPending}
      >
        <section
          data-testid="tutor-meta-layer"
          className="mb-1.5 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground"
          aria-label="Tutor-Ebene der Lernplattform"
        >
          <Bot className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          <p className="min-w-0 flex-1 truncate">
            <span className="font-semibold text-foreground">Tutor-Ebene</span>
            {displayedStep && displayedStepNumber
              ? ` · Schritt ${displayedStepNumber}: ${displayedStep.title}`
              : ""}
          </p>
          <div
            className="flex shrink-0 items-center gap-1"
            role="group"
            aria-label="Sekundäre Tutorführung und Wiederholung"
          >
            <button
              type="button"
              data-learning-role="replay-navigation"
              disabled={!previousStepId || guidedNavigationPending}
              onClick={() => previousStepId && void navigateToGuidedStep(previousStepId)}
              className="inline-flex h-7 items-center gap-0.5 rounded-md border border-border bg-card/60 px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-ring hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Tutorführung zurück"
            >
              <ChevronLeft className="h-3 w-3" aria-hidden="true" />
              Zurück
            </button>
            <button
              type="button"
              data-learning-role="replay-navigation"
              disabled={!nextStepId || guidedNavigationPending}
              onClick={() => nextStepId && void navigateToGuidedStep(nextStepId)}
              className="inline-flex h-7 items-center gap-0.5 rounded-md border border-border bg-card/60 px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-ring hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Tutorführung weiter"
            >
              Weiter
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            </button>
            {displayedStep?.highlightTarget ? (
              <button
                type="button"
                data-learning-role="optional-help"
                onClick={() =>
                  requestTutorAttention(
                    [displayedStep.highlightTarget!],
                    displayedStep.highlightTooltip ??
                      `Relevanter Bereich für „${displayedStep.title}“.`,
                  )
                }
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card/60 px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-ring hover:text-foreground motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Im Werkzeug zeigen"
              >
                <Focus className="h-3 w-3 text-accent" aria-hidden="true" />
                <span className="hidden sm:inline">Ziel zeigen</span>
              </button>
            ) : null}
          </div>
        </section>

        {isGuidedReplay ? (
          <div
            className="mb-1.5 flex items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-[11px] text-foreground"
            role="note"
            aria-live="polite"
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              Wiederholung: Dein abgeschlossener Fortschritt und alle bisherigen Versuche bleiben
              erhalten. Nach erfolgreicher Wiederholung kehrst du zum aktuellen Schritt zurück.
            </span>
          </div>
        ) : null}

        <ol className="flex min-w-0 gap-1 overflow-x-auto pb-0.5" aria-label="Schrittfolge">
          {scenario.steps.map((step, index) => {
            const status = progress.statuses[step.id] ?? "NOT_STARTED";
            const isDisplayed = step.id === displayedStepId;
            const isFurthest = step.id === furthestStepId;
            const isCompleted = status === "COMPLETED";
            const isSkipped = status === "SKIPPED";
            const isReachable = isCompleted || isFurthest;
            const stepNumber = index + 1;
            const titleId = `guided-step-navigation-title-${step.id}`;
            const label = isDisplayed
              ? `Trainingsschritt ${stepNumber} geöffnet`
              : isFurthest
                ? `Zum aktuellen Trainingsschritt ${stepNumber}`
                : isCompleted
                  ? `Trainingsschritt ${stepNumber} wiederholen`
                  : isSkipped
                    ? `Trainingsschritt ${stepNumber} übersprungen`
                    : `Trainingsschritt ${stepNumber} noch nicht erreichbar`;

            return (
              <li key={step.id} className="shrink-0">
                <button
                  type="button"
                  data-testid={`guided-step-navigation-${step.id}`}
                  data-learning-role="replay-navigation"
                  disabled={!isReachable || guidedNavigationPending}
                  aria-current={isDisplayed ? "step" : undefined}
                  aria-label={label}
                  aria-describedby={titleId}
                  onClick={() => void navigateToGuidedStep(step.id)}
                  className={`inline-flex h-7 max-w-[10rem] items-center gap-1 rounded-md border px-1.5 text-[10px] transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-35 ${
                    isDisplayed
                      ? "border-border bg-card font-semibold text-foreground"
                      : isReachable
                        ? "border-border/80 bg-card/60 text-muted-foreground hover:border-ring hover:text-foreground"
                        : "border-border/60 bg-muted/30 text-muted-foreground"
                  }`}
                >
                  {isDisplayed || isFurthest ? (
                    <CircleDot className="h-3 w-3 shrink-0 text-accent" />
                  ) : isCompleted ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
                  ) : isSkipped ? (
                    <SkipForward className="h-3 w-3 shrink-0" />
                  ) : (
                    <Circle className="h-3 w-3 shrink-0" />
                  )}
                  <span className="font-mono text-[9px]">{stepNumber}</span>
                  <span id={titleId} className="truncate">
                    {step.title}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <TutorAttentionOverlay
        runtimeAdapterId={scenario.environment?.runtimeAdapterId}
        integrationRuntimeAdapterIds={scenario.environment?.integrationRuntimeAdapterIds}
      />
    </>
  );
}
