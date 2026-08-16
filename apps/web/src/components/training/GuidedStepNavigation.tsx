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
        className="platform-ui shrink-0 border-b border-border bg-panel px-2 py-2 sm:px-4"
        aria-label="Guided-Schritte"
        aria-busy={guidedNavigationPending}
      >
        <section
          data-testid="tutor-meta-layer"
          className="mb-2 flex flex-col gap-2 rounded-lg border border-accent/35 bg-card px-3 py-2 sm:flex-row sm:items-center"
          aria-label="Tutor-Ebene der Lernplattform"
        >
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Bot className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                Tutor-Ebene · Lernplattform
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {displayedStep && displayedStepNumber
                  ? `Schritt ${displayedStepNumber} · ${displayedStep.title}. `
                  : ""}
                Diese Plattformführung erklärt und lenkt deine Aufmerksamkeit. Handlungen selbst
                führst du im simulierten Werkzeug aus.
              </p>
            </div>
          </div>

          <div
            className="flex shrink-0 flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Tutorführung"
          >
            <button
              type="button"
              disabled={!previousStepId || guidedNavigationPending}
              onClick={() => previousStepId && void navigateToGuidedStep(previousStepId)}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background/60 px-2 text-[11px] font-medium text-foreground transition-colors hover:border-ring hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Tutorführung zurück"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Zurück
            </button>
            <button
              type="button"
              disabled={!nextStepId || guidedNavigationPending}
              onClick={() => nextStepId && void navigateToGuidedStep(nextStepId)}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background/60 px-2 text-[11px] font-medium text-foreground transition-colors hover:border-ring hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Tutorführung weiter"
            >
              Weiter
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {displayedStep?.highlightTarget ? (
              <button
                type="button"
                onClick={() =>
                  requestTutorAttention(
                    [displayedStep.highlightTarget!],
                    displayedStep.highlightTooltip ??
                      `Relevanter Bereich für „${displayedStep.title}“.`,
                  )
                }
                className="inline-flex h-8 items-center gap-1 rounded-md border border-accent/45 bg-accent/10 px-2 text-[11px] font-semibold text-foreground transition-colors hover:bg-accent/15 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Im Werkzeug zeigen"
              >
                <Focus className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                Im Werkzeug zeigen
              </button>
            ) : null}
          </div>
        </section>

        {isGuidedReplay ? (
          <div
            className="mb-2 flex items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-[11px] text-foreground"
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

        <ol className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5" aria-label="Schrittfolge">
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
                  disabled={!isReachable || guidedNavigationPending}
                  aria-current={isDisplayed ? "step" : undefined}
                  aria-label={label}
                  aria-describedby={titleId}
                  onClick={() => void navigateToGuidedStep(step.id)}
                  className={`inline-flex h-8 max-w-[12rem] items-center gap-1.5 rounded-md border px-2 text-[11px] transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:cursor-not-allowed disabled:opacity-45 ${
                    isDisplayed
                      ? "border-accent/60 bg-accent/10 font-semibold text-foreground"
                      : isReachable
                        ? "border-border bg-card text-muted-foreground hover:border-ring hover:text-foreground"
                        : "border-border/70 bg-muted/40 text-muted-foreground"
                  }`}
                >
                  {isDisplayed || isFurthest ? (
                    <CircleDot className="h-3.5 w-3.5 shrink-0 text-accent" />
                  ) : isCompleted ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                  ) : isSkipped ? (
                    <SkipForward className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="font-mono text-[10px]">{stepNumber}</span>
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
