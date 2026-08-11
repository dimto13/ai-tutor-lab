import { useEffect, useState } from "react";
import type { ReactNode } from "react";
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
  const { mode } = useTraining();

  return (
    <aside className="flex h-full min-w-0 flex-1 flex-col border-border bg-panel lg:w-[380px] lg:flex-none lg:border-l">
      {mode === "guided" ? (
        <GuidedGuide />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {mode === "explore" ? <ExploreGuide /> : <ChallengeGuide />}
        </div>
      )}
      <TutorChat />
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
  const nextStep =
    stepIndex >= 0
      ? (scenario.steps.slice(stepIndex + 1).find((candidate) => {
          const status = progress.statuses[candidate.id] ?? "NOT_STARTED";
          return status !== "COMPLETED" && status !== "SKIPPED";
        }) ?? null)
      : null;
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
        className="shrink-0 border-b border-border bg-panel p-3"
        aria-label="Orientierung im aktuellen Trainingsschritt"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Training Guide · Guided
        </p>
        <h2 className="mt-1 text-sm font-semibold leading-snug text-foreground">
          Schritt {stepNumber} – {step.title}
        </h2>

        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] leading-snug">
          <OrientationItem label="Wo bin ich?">
            Schritt {stepNumber} von {scenario.steps.length}
          </OrientationItem>
          <OrientationItem label="Was kommt als Nächstes?">
            {nextStep?.title ?? "Training abschließen"}
          </OrientationItem>
          <OrientationItem label="Was soll ich tun?" wide>
            <GlossaryText conceptKeys={glossaryConceptKeys}>{step.instruction}</GlossaryText>
          </OrientationItem>
          <OrientationItem label="Warum?" wide>
            <span className={showWhy ? "" : "line-clamp-2"}>
              <GlossaryText conceptKeys={glossaryConceptKeys}>{rationale}</GlossaryText>
            </span>
            <button
              type="button"
              onClick={() => setShowWhy((visible) => !visible)}
              className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-accent"
            >
              <HelpCircle className="h-3 w-3" />
              {showWhy ? "Warum einklappen" : "Warum vollständig anzeigen"}
            </button>
          </OrientationItem>
          <OrientationItem label="War meine Aktion erfolgreich?" wide>
            <span
              aria-live="polite"
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
          </OrientationItem>
        </div>
      </section>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          <GlossaryText conceptKeys={glossaryConceptKeys}>{step.description}</GlossaryText>
        </p>

        <div className="mt-3 rounded-lg border border-accent/30 bg-accent/10 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            {isExplanation ? "Konzept" : "Deine Aufgabe"}
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-foreground">
            <GlossaryText conceptKeys={glossaryConceptKeys}>{step.instruction}</GlossaryText>
          </p>
        </div>

        {isExplanation ? (
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={completeExplanationStep}
              className="w-full rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent/20"
            >
              {isIntroduction ? "Grundbegriff verstanden" : "Konzept verstanden"}
            </button>
            {isIntroduction && step.optional ? (
              <button
                type="button"
                onClick={skipOptionalSteps}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
              >
                <SkipForward className="h-3.5 w-3.5" /> Grundbegriffe überspringen
              </button>
            ) : null}
          </div>
        ) : (
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
              Hilfesystem
            </p>
            {helpLevel < 3 ? (
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Vor Abruf: Für Hilfe {nextHelpLevel} ist ein Abzug von {nextHelpDeduction} % auf den
                Schrittbonus vorgesehen. Die angezeigten Gesamtpunkte berücksichtigen diesen Abzug
                derzeit noch nicht. Fehlversuche selbst kosten keine Punkte.
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
              className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-foreground transition-colors disabled:opacity-40 ${
                shouldOfferHelp
                  ? "border-warning/60 bg-warning/10 hover:bg-warning/15"
                  : "border-border hover:border-ring hover:bg-white/5"
              }`}
            >
              <Lightbulb className="h-3.5 w-3.5 text-warning" />
              {helpLevel >= 3
                ? "Alle Hinweise gezeigt"
                : shouldOfferHelp
                  ? `Hilfe ${nextHelpLevel} jetzt anzeigen`
                  : `Hilfe ${nextHelpLevel} anzeigen`}
            </button>
          </div>
        )}

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
        </div>
      </div>
    </>
  );
}

function OrientationItem({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-md border border-border bg-card/60 p-2 ${wide ? "col-span-2" : ""}`}>
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 text-[11px] text-foreground">{children}</div>
    </div>
  );
}

function ExploreGuide() {
  const { scenario, progress, percent } = useTraining();
  const runtime = getRuntimeAdapter(scenario.environment?.runtimeAdapterId);
  const surface = (runtime?.describeSurface() ?? []).filter((item) =>
    (scenario.exploreTargets ?? []).includes(item.ref),
  );
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
