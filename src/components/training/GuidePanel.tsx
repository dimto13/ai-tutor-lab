import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock3,
  HelpCircle,
  Lightbulb,
  RotateCcw,
  Search,
  Target,
} from "lucide-react";
import { useTraining } from "@/state/trainingStore";
import { TutorChat } from "@/components/tutor/TutorChat";
import { vscodeRuntime } from "@/runtime/vscodeRuntime";
import { getGlossaryConceptByKey, getGlossaryConceptForTarget } from "@/lib/glossary";

export function GuidePanel() {
  const { scenario, mode, progress, feedback, helpLevel, revealHelp, completeExplanationStep } =
    useTraining();
  const step = scenario.steps.find((candidate) => candidate.id === progress.activeStepId);
  const [showWhy, setShowWhy] = useState(false);
  const stepNumber = step
    ? scenario.steps.findIndex((candidate) => candidate.id === step.id) + 1
    : scenario.steps.length;
  const isExplanation = step?.stepType === "explanation";

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-border bg-panel">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {mode === "explore" ? (
          <ExploreGuide />
        ) : mode === "challenge" ? (
          <ChallengeGuide />
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Training Guide · Guided
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
                    {isExplanation ? "Konzept" : "Deine Aufgabe"}
                  </p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-foreground">
                    {step.instruction}
                  </p>
                </div>

                {feedback ? <Feedback feedback={feedback} /> : null}

                {isExplanation ? (
                  <button
                    type="button"
                    onClick={completeExplanationStep}
                    className="mt-4 w-full rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent/20"
                  >
                    Verstanden – weiter
                  </button>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  {!isExplanation ? (
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
                  ) : null}
                  <button
                    onClick={() => setShowWhy((visible) => !visible)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-ring hover:bg-white/5"
                  >
                    <HelpCircle className="h-3.5 w-3.5 text-accent" />
                    Warum ist das wichtig?
                  </button>
                </div>

                {showWhy ? (
                  <p className="mt-3 rounded-lg border border-border bg-card p-3 text-[13px] leading-relaxed text-muted-foreground">
                    {step.why}
                  </p>
                ) : null}

                {!isExplanation && helpLevel > 0 ? (
                  <ol className="mt-3 space-y-2">
                    {step.helpLevels.slice(0, helpLevel).map((hint, index) => (
                      <li
                        key={index}
                        className="rounded-lg border border-border bg-card p-3 text-[13px] leading-relaxed"
                      >
                        <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wider text-warning">
                          Hilfe {index + 1}
                        </span>
                        <span className="text-muted-foreground">{hint}</span>
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
                {scenario.steps.map((scenarioStep, index) => {
                  const status = progress.statuses[scenarioStep.id] ?? "NOT_STARTED";
                  return (
                    <li key={scenarioStep.id} className="flex items-center gap-2 text-[13px]">
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
                        {index + 1}. {scenarioStep.title}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </>
        )}
      </div>

      <TutorChat />
    </aside>
  );
}

function ExploreGuide() {
  const { scenario, progress, percent } = useTraining();
  const surface = vscodeRuntime
    .describeSurface()
    .filter((item) => (scenario.exploreTargets ?? []).includes(item.ref));
  const activeSurface = surface.find((item) => item.ref === progress.lastInspectedRef) ?? null;
  const concept = activeSurface
    ? (getGlossaryConceptByKey(activeSurface.conceptKey) ??
      getGlossaryConceptForTarget(activeSurface.ref))
    : null;

  return (
    <>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Search className="h-3.5 w-3.5 text-accent" /> Explorer-Modus
      </div>
      <h2 className="mt-2 text-lg font-semibold leading-snug text-foreground">
        Oberfläche frei untersuchen
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        Klicke frei auf Bereiche von VS Code. Es gibt keine falsche Reihenfolge und keine
        Fehlermeldungen.
      </p>

      <div className="mt-3 rounded-lg border border-accent/30 bg-accent/10 p-3">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-accent">
          <span>Erkundungsfortschritt</span>
          <span>{percent} %</span>
        </div>
        <p className="mt-1 text-[13px] text-foreground">
          {progress.exploredTargets.length} von {surface.length} Oberflächen untersucht
        </p>
      </div>

      {concept && activeSurface ? (
        <div className="mt-4 rounded-lg border border-border bg-card p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            {activeSurface.label}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">{concept.term}</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-foreground">{concept.simple}</p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            {concept.advanced}
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-border bg-card p-3 text-[13px] leading-relaxed text-muted-foreground">
          Klicke auf ein inspizierbares Element, um seine Erklärung zu sehen.
        </div>
      )}

      <div className="mt-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Oberflächen
        </p>
        <ul className="space-y-1.5">
          {surface.map((item) => {
            const done = progress.exploredTargets.includes(item.ref);
            return (
              <li key={item.ref} className="flex items-center gap-2 text-[12.5px]">
                {done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                )}
                <span className={done ? "text-muted-foreground" : "text-foreground"}>
                  {item.label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

function formatRemainingTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function ChallengeGuide() {
  const {
    scenario,
    feedback,
    challengeOutcome,
    challengeRemainingSeconds,
    restart,
  } = useTraining();
  const goal = scenario.steps[0];
  const timedOut = challengeOutcome === "timed_out";

  return (
    <>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Target className="h-3.5 w-3.5 text-accent" /> Challenge
      </div>
      <h2 className="mt-2 text-lg font-semibold leading-snug text-foreground">
        {goal?.title ?? scenario.title}
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        {scenario.description}
      </p>

      {scenario.timeLimitSeconds !== undefined ? (
        <div
          className={`mt-3 flex items-center justify-between rounded-lg border p-3 ${
            timedOut
              ? "border-destructive/40 bg-destructive/10"
              : "border-warning/40 bg-warning/10"
          }`}
        >
          <div className="flex items-center gap-2">
            <Clock3 className={`h-4 w-4 ${timedOut ? "text-destructive" : "text-warning"}`} />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Harte Zeitgrenze
              </p>
              <p className="text-[12px] text-muted-foreground">
                Nach Ablauf ist dieser Versuch fehlgeschlagen.
              </p>
            </div>
          </div>
          <span className="font-mono text-lg font-semibold text-foreground">
            {formatRemainingTime(challengeRemainingSeconds ?? scenario.timeLimitSeconds)}
          </span>
        </div>
      ) : null}

      {goal ? (
        <div className="mt-3 rounded-lg border border-accent/30 bg-accent/10 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Ziel</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-foreground">{goal.instruction}</p>
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-border bg-card p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Bewertung
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          Es gibt keine automatische Klickführung. Das System prüft ausschließlich den erreichten
          Endzustand. Bei einer Zeit-Challenge muss dieser Zustand zusätzlich vor Ablauf der
          Zeitgrenze erreicht sein.
        </p>
      </div>

      {feedback ? <Feedback feedback={feedback} /> : null}

      {timedOut ? (
        <button
          type="button"
          onClick={restart}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-ring hover:bg-white/5"
        >
          <RotateCcw className="h-4 w-4" /> Challenge neu starten
        </button>
      ) : null}
    </>
  );
}

function Feedback({ feedback }: { feedback: { kind: "success" | "error"; message: string } }) {
  return (
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
  );
}
