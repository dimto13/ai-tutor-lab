import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  CircleDot,
  AlertTriangle,
  Lightbulb,
  HelpCircle,
} from "lucide-react";
import { useTraining } from "@/state/trainingStore";
import { TutorChat } from "@/components/tutor/TutorChat";

export function GuidePanel() {
  const { scenario, progress, feedback, helpLevel, revealHelp } = useTraining();
  const step = scenario.steps.find((s) => s.id === progress.activeStepId);
  const [showWhy, setShowWhy] = useState(false);
  const stepNumber = step
    ? scenario.steps.findIndex((s) => s.id === step.id) + 1
    : scenario.steps.length;

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-border bg-panel">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Training Guide
        </p>

        {step ? (
          <>
            <h2 className="mt-2 text-lg font-semibold leading-snug text-foreground">
              Schritt {stepNumber} – {step.title}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {step.description}
            </p>

            <div className="mt-3 rounded-lg border border-accent/30 bg-accent/10 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                Deine Aufgabe
              </p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-foreground">
                {step.instruction}
              </p>
            </div>

            {feedback ? (
              <div
                className={`mt-3 flex gap-2 rounded-lg border p-3 text-[13px] leading-relaxed ${
                  feedback.kind === "success"
                    ? "border-success/40 bg-success/10 text-foreground"
                    : "border-destructive/40 bg-destructive/10 text-foreground"
                }`}
              >
                {feedback.kind === "success" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <span>{feedback.message}</span>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={revealHelp}
                disabled={helpLevel >= 3}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-ring hover:bg-white/5 disabled:opacity-40"
              >
                <Lightbulb className="h-3.5 w-3.5 text-warning" />
                {helpLevel === 0
                  ? "Hinweis anzeigen"
                  : helpLevel >= 3
                    ? "Alle Hinweise gezeigt"
                    : "Mehr Hilfe"}
              </button>
              <button
                onClick={() => setShowWhy((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-ring hover:bg-white/5"
              >
                <HelpCircle className="h-3.5 w-3.5 text-accent" />
                Warum mache ich das?
              </button>
            </div>

            {showWhy ? (
              <p className="mt-3 rounded-lg border border-border bg-card p-3 text-[13px] leading-relaxed text-muted-foreground">
                {step.why}
              </p>
            ) : null}

            {helpLevel > 0 ? (
              <ol className="mt-3 space-y-2">
                {step.helpLevels.slice(0, helpLevel).map((h, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-border bg-card p-3 text-[13px] leading-relaxed"
                  >
                    <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wider text-warning">
                      Hilfe {i + 1}
                    </span>
                    <span className="text-muted-foreground">{h}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Alle Schritte abgeschlossen.</p>
        )}

        <div className="mt-6">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Schulungsfortschritt
          </p>
          <ol className="space-y-1">
            {scenario.steps.map((s, i) => {
              const status = progress.statuses[s.id] ?? "NOT_STARTED";
              return (
                <li key={s.id} className="flex items-center gap-2 text-[13px]">
                  {status === "COMPLETED" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  ) : status === "ACTIVE" || status === "VALIDATION_FAILED" ? (
                    <CircleDot className="h-4 w-4 shrink-0 text-accent" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                  )}
                  <span
                    className={
                      status === "COMPLETED"
                        ? "text-muted-foreground line-through decoration-muted-foreground/40"
                        : status === "ACTIVE" || status === "VALIDATION_FAILED"
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                    }
                  >
                    {i + 1}. {s.title}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <TutorChat />
    </aside>
  );
}
