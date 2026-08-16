import { useEffect, useState } from "react";
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
  SkipForward,
  Target,
} from "lucide-react";
import { useTraining } from "@/state/trainingStore";
import { TutorChat } from "@/components/tutor/TutorChat";
import { getRuntimeAdapter } from "@/runtime";
import { getGlossaryConceptByKey, getGlossaryConceptForTarget } from "@/lib/glossary";
import { GlossaryText } from "@/components/training/GlossaryText";
import { getHelpBonusDeductionPercent } from "@/types/training";

const FAILURES_PER_HELP_OFFER = 3;

export function GuidePanel() {
  const { mode, progress, helpLevel, recovery } = useTraining();
  const tutorProminent =
    mode === "guided" &&
    (Boolean(recovery) || progress.activeStepMistakes >= FAILURES_PER_HELP_OFFER || helpLevel > 0);

  return (
    <aside className="flex h-full min-w-0 flex-1 flex-col border-border bg-panel lg:w-[380px] lg:flex-none lg:border-l">
      {mode === "guided" ? (
        <GuidedGuide />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {mode === "explore" ? <ExploreGuide /> : <ChallengeGuide />}
        </div>
      )}
      <TutorChat prominent={tutorProminent} />
    </aside>
  );
}

function GuidedGuide() {
  const {
    scenario,
    progress,
    feedback,
    helpLevel,
    revealHelp,
    completeExplanationStep,
    skipOptionalSteps,
  } = useTraining();
  const step = scenario.steps.find((candidate) => candidate.id === progress.activeStepId);
  const [showWhy, setShowWhy] = useState(false);
  const stepIndex = step ? scenario.steps.findIndex((candidate) => candidate.id === step.id) : -1;
  const stepNumber = step ? stepIndex + 1 : scenario.steps.length;
  const isExplanation = step?.stepType === "explanation";
  const isIntroduction = step
    ? (scenario.audience?.introductionStepIds?.includes(step.id) ?? false)
    : false;
  const glossaryConceptKeys = scenario.audience?.glossaryConcepts ?? [];
  const rationale =
    step?.rationale ?? step?.why ?? "Für diesen Schritt ist keine Begründung hinterlegt.";
  const nextHelpLevel = Math.min(helpLevel + 1, 3) as 1 | 2 | 3;
  const nextHelpDeduction = getHelpBonusDeductionPercent(nextHelpLevel);
  const shouldOfferHelp =
    Boolean(step) &&
    !isExplanation &&
    helpLevel < 3 &&
    progress.activeStepMistakes >= (helpLevel + 1) * FAILURES_PER_HELP_OFFER;

  useEffect(() => {
    setShowWhy(false);
  }, [step?.id]);

  if (!step) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Training Guide · Guided
        </p>
        <p className="mt-4 text-sm text-muted-foreground">Alle Schritte abgeschlossen.</p>
      </div>
    );
  }

  return (
    <>
      <section
        data-testid="guided-orientation"
        data-platform-ui="guided-primary-action"
        className="platform-ui shrink-0 border-b border-border bg-background p-3 sm:p-4"
        aria-label="Aktueller Lernauftrag"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Dein nächster Schritt · {stepNumber} von {scenario.steps.length}
        </p>
        <h2
          id="guided-current-step-title"
          className="mt-1 text-sm font-semibold leading-snug text-foreground"
        >
          Schritt {stepNumber} – {step.title}
        </h2>

        {isExplanation ? (
          <div className="mt-3 rounded-lg border border-accent/45 bg-card p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
              Primäre Aktion · Lernplattform
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-foreground">
              <GlossaryText conceptKeys={glossaryConceptKeys}>{step.instruction}</GlossaryText>
            </p>
            <button
              type="button"
              data-testid="guided-primary-action"
              data-primary-learning-action="true"
              data-primary-action-kind="platform"
              onClick={completeExplanationStep}
              className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {isIntroduction ? "Grundbegriff verstanden" : "Konzept verstanden"}
            </button>
            {isIntroduction && step.optional ? (
              <button
                type="button"
                onClick={skipOptionalSteps}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-ring hover:text-foreground motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <SkipForward className="h-3.5 w-3.5" aria-hidden="true" /> Grundbegriffe
                überspringen
              </button>
            ) : null}
          </div>
        ) : (
          <div
            data-testid="guided-primary-action"
            data-primary-learning-action="true"
            data-primary-action-kind="runtime"
            data-primary-target={step.highlightTarget ?? ""}
            className="mt-3 rounded-lg border border-accent/45 bg-card p-3"
            role="group"
            aria-label="Primäre nächste Lernaktion im simulierten Werkzeug"
          >
            <div className="flex items-start gap-2">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                  Primäre Aktion · simuliertes Werkzeug
                </p>
                <p className="mt-1 text-[13px] font-medium leading-relaxed text-foreground">
                  <GlossaryText conceptKeys={glossaryConceptKeys}>{step.instruction}</GlossaryText>
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Führe diese Aktion direkt im Werkzeug aus. Die Lernplattform löst sie nicht für
                  dich aus.
                </p>
              </div>
            </div>
          </div>
        )}

        <div
          className="mt-2 rounded-md border border-border bg-card/70 px-2.5 py-2 text-[11px] leading-relaxed"
          aria-live="polite"
        >
          <span className="font-semibold text-muted-foreground">Rückmeldung: </span>
          <span
            className={
              feedback?.kind === "success"
                ? "text-success"
                : feedback?.kind === "error"
                  ? "text-destructive"
                  : "text-muted-foreground"
            }
          >
            {feedback?.message ?? "Noch keine Aktion geprüft."}
          </span>
        </div>
      </section>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          <GlossaryText conceptKeys={glossaryConceptKeys}>{step.description}</GlossaryText>
        </p>

        <div className="mt-3 rounded-lg border border-border bg-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Warum ist das wichtig?
              </p>
              <p
                className={`mt-1 text-[12px] leading-relaxed text-muted-foreground ${showWhy ? "" : "line-clamp-2"}`}
              >
                <GlossaryText conceptKeys={glossaryConceptKeys}>{rationale}</GlossaryText>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowWhy((visible) => !visible)}
              className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HelpCircle className="h-3 w-3" aria-hidden="true" />
              {showWhy ? "Weniger" : "Mehr"}
            </button>
          </div>
        </div>

        {!isExplanation ? (
          <div className="mt-4 rounded-lg border border-border bg-card p-3">
            {shouldOfferHelp ? (
              <div
                aria-live="polite"
                className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-[12px] leading-relaxed text-foreground"
              >
                Du hattest bei diesem Schritt {progress.activeStepMistakes} Fehlversuche. Die
                nächste Hilfestufe ist jetzt aktiv verfügbar.
              </div>
            ) : null}
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Optionaler Hinweis
            </p>
            {helpLevel < 3 ? (
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Vor Abruf: Für Hilfe {nextHelpLevel} ist ein Abzug von {nextHelpDeduction} % auf den
                Schrittbonus vorgesehen. Bei einer serverseitigen Wertung wird dieser Abzug beim
                Abschluss berücksichtigt. Fehlversuche selbst kosten keine Punkte.
              </p>
            ) : (
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Alle drei Hilfestufen wurden bereits verwendet.
              </p>
            )}
            <button
              type="button"
              onClick={revealHelp}
              disabled={helpLevel >= 3}
              className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-foreground transition-colors disabled:opacity-40 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                shouldOfferHelp
                  ? "border-warning/60 bg-warning/10 hover:bg-warning/15"
                  : "border-border hover:border-ring hover:bg-muted"
              }`}
            >
              <Lightbulb className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
              {helpLevel >= 3
                ? "Alle Hinweise gezeigt"
                : shouldOfferHelp
                  ? `Hilfe ${nextHelpLevel} jetzt anzeigen`
                  : `Hilfe ${nextHelpLevel} anzeigen`}
            </button>
          </div>
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
                <span className="text-muted-foreground">
                  <GlossaryText conceptKeys={glossaryConceptKeys}>{hint}</GlossaryText>
                </span>
              </li>
            ))}
          </ol>
        ) : null}

        <details className="mt-5 rounded-lg border border-border bg-card p-3">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Schulungsfortschritt anzeigen
          </summary>
          <ol className="mt-3 space-y-1">
            {scenario.steps.map((scenarioStep, index) => {
              const status = progress.statuses[scenarioStep.id] ?? "NOT_STARTED";
              return (
                <li key={scenarioStep.id} className="flex items-center gap-2 text-[13px]">
                  {status === "COMPLETED" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  ) : status === "SKIPPED" ? (
                    <SkipForward className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : status === "ACTIVE" || status === "VALIDATION_FAILED" ? (
                    <CircleDot className="h-4 w-4 shrink-0 text-accent" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                  )}
                  <span
                    className={
                      status === "COMPLETED"
                        ? "text-muted-foreground line-through decoration-muted-foreground/40"
                        : status === "SKIPPED"
                          ? "text-muted-foreground"
                          : status === "ACTIVE" || status === "VALIDATION_FAILED"
                            ? "font-medium text-foreground"
                            : "text-muted-foreground"
                    }
                  >
                    {index + 1}. {scenarioStep.title}
                    {status === "SKIPPED" ? " (übersprungen)" : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </details>
      </div>
    </>
  );
}

function ExploreGuide() {
  const { scenario, progress, percent } = useTraining();
  const runtimeIds = [
    scenario.environment?.runtimeAdapterId,
    ...(scenario.environment?.integrations ?? []).map(
      (integration) => integration.runtimeAdapterId,
    ),
  ].filter((runtimeId): runtimeId is string => Boolean(runtimeId));
  const targets = new Set(scenario.exploreTargets ?? []);
  const surface = [
    ...new Map(
      runtimeIds
        .flatMap((runtimeId) => getRuntimeAdapter(runtimeId)?.describeSurface() ?? [])
        .filter((item) => targets.has(item.ref))
        .map((item) => [item.ref, item] as const),
    ).values(),
  ];
  const exploredSurfaceCount = surface.filter((item) =>
    progress.exploredTargets.includes(item.ref),
  ).length;
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
        Klicke frei auf Bereiche der simulierten Oberfläche. Es gibt keine falsche Reihenfolge und
        keine Fehlermeldungen.
      </p>

      <div className="mt-3 rounded-lg border border-accent/30 bg-accent/10 p-3">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-accent">
          <span>Erkundungsfortschritt</span>
          <span>{percent} %</span>
        </div>
        <p className="mt-1 text-[13px] text-foreground">
          {exploredSurfaceCount} von {surface.length} Oberflächen untersucht
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
  const { scenario, feedback, challengeOutcome, challengeRemainingSeconds, restart } =
    useTraining();
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
            timedOut ? "border-destructive/40 bg-destructive/10" : "border-warning/40 bg-warning/10"
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
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-ring hover:bg-muted"
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
      role="status"
      aria-live="polite"
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
