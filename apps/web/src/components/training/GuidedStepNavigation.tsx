import { CheckCircle2, Circle, CircleDot, RotateCcw, SkipForward } from "lucide-react";
import { useTraining } from "@/state/trainingStore";

export function GuidedStepNavigation() {
  const {
    scenario,
    progress,
    isGuidedReplay,
    guidedNavigationPending,
    navigateToGuidedStep,
  } = useTraining();

  const furthestStepId =
    scenario.steps.find((step) => {
      const status = progress.statuses[step.id];
      return status === "ACTIVE" || status === "VALIDATION_FAILED";
    })?.id ?? null;
  const displayedStepId = progress.activeStepId;

  return (
    <nav
      data-testid="guided-step-navigation"
      data-platform-ui="guided-step-navigation"
      className="platform-ui shrink-0 border-b border-border bg-panel px-2 py-2 sm:px-4"
      aria-label="Guided-Schritte"
      aria-busy={guidedNavigationPending}
    >
      {isGuidedReplay ? (
        <div
          className="mb-2 flex items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-[11px] text-foreground"
          role="status"
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
          const label = isDisplayed
            ? `Schritt ${index + 1} geöffnet: ${step.title}`
            : isFurthest
              ? `Zum aktuellen Schritt ${index + 1}: ${step.title}`
              : isCompleted
                ? `Schritt ${index + 1} wiederholen: ${step.title}`
                : isSkipped
                  ? `Schritt ${index + 1} wurde übersprungen und ist nicht navigierbar: ${step.title}`
                  : `Schritt ${index + 1} noch nicht erreichbar: ${step.title}`;

          return (
            <li key={step.id} className="shrink-0">
              <button
                type="button"
                data-testid={`guided-step-navigation-${step.id}`}
                disabled={!isReachable || guidedNavigationPending}
                aria-current={isDisplayed ? "step" : undefined}
                aria-label={label}
                onClick={() => void navigateToGuidedStep(step.id)}
                className={`inline-flex h-8 max-w-[12rem] items-center gap-1.5 rounded-md border px-2 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:cursor-not-allowed disabled:opacity-45 ${
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
                <span className="font-mono text-[10px]">{index + 1}</span>
                <span className="truncate">{step.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
