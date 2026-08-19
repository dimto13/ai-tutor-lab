import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, RotateCcw, Sparkles } from "lucide-react";
import type { SelfAssessedAiLevel, TrainingMode } from "@ai-train-lab/training-engine";
import type {
  DashboardPrimaryAction,
  DashboardResumeCandidate,
} from "@/dashboard/dashboardRecommendation";
import {
  selectCalibratedDashboardRecommendation,
  type DashboardLearningGoal,
} from "@/dashboard/dashboardQuickStartRecommendation";
import { allDashboardTrainingCandidates } from "@/dashboard/dashboardRecommendationContext";
import type { ResumeLoadStatus } from "@/dashboard/useTrainingRecommendation";
import { aiLevelLabel } from "@/profile/aiLevelOptions";
import { useUserPreferences } from "@/profile/UserPreferencesContext";

const learningGoals: Array<{ value: DashboardLearningGoal; label: string; description: string }> = [
  {
    value: "learn_tool",
    label: "Werkzeug kennenlernen",
    description: "Mit Oberfläche, Begriffen und Grundfunktionen beginnen.",
  },
  {
    value: "daily_confidence",
    label: "Sicherer im Alltag werden",
    description: "Einen belastbaren nächsten Schritt für die tägliche Arbeit wählen.",
  },
  {
    value: "solve_task",
    label: "Konkrete Aufgabe lösen",
    description: "Direkt in einen anwendungsnahen Workflow einsteigen.",
  },
  {
    value: "deepen",
    label: "Kenntnisse vertiefen",
    description: "Auf vorhandenem Wissen aufbauen und anspruchsvoller weiterlernen.",
  },
];

const workStyles: Array<{ value: TrainingMode; label: string; description: string }> = [
  {
    value: "guided",
    label: "Guided",
    description: "Schritt für Schritt mit klarer Führung.",
  },
  {
    value: "explore",
    label: "Explore",
    description: "Frei erkunden und Zusammenhänge selbst entdecken.",
  },
  {
    value: "challenge",
    label: "Challenge",
    description: "Direkt eine Aufgabe selbstständig versuchen.",
  },
];

function modeLabel(mode: TrainingMode): string {
  switch (mode) {
    case "guided":
      return "Guided";
    case "explore":
      return "Explore";
    case "challenge":
      return "Challenge";
  }
}

export function DashboardQuickStart({
  basePrimaryAction,
  recommendationLoading,
  resumable,
  resumeStatus,
}: {
  basePrimaryAction: DashboardPrimaryAction | null;
  recommendationLoading: boolean;
  resumable: readonly DashboardResumeCandidate[];
  resumeStatus: ResumeLoadStatus;
}) {
  const preferences = useUserPreferences();
  const [goal, setGoal] = useState<DashboardLearningGoal>("learn_tool");
  const [preferredMode, setPreferredMode] = useState<TrainingMode>("guided");

  const effectiveAiLevel: SelfAssessedAiLevel | null =
    preferences.status === "ready" ? (preferences.selfAssessedAiLevel ?? "beginner") : null;

  const recommendation = useMemo(
    () =>
      effectiveAiLevel && !recommendationLoading
        ? selectCalibratedDashboardRecommendation({
            basePrimaryAction,
            resumable,
            trainingCandidates: allDashboardTrainingCandidates,
            calibration: {
              goal,
              selfAssessedAiLevel: effectiveAiLevel,
              preferredMode,
            },
          })
        : null,
    [basePrimaryAction, effectiveAiLevel, goal, preferredMode, recommendationLoading, resumable],
  );

  const otherResumable = resumable.filter(
    (candidate) =>
      recommendation?.primaryAction?.kind !== "resume" ||
      candidate.scenarioId !== recommendation.primaryAction.scenarioId,
  );
  const loading =
    recommendationLoading ||
    resumeStatus === "loading" ||
    preferences.status === "idle" ||
    preferences.status === "loading";

  return (
    <section aria-labelledby="dashboard-next-action-heading">
      <div>
        <h2 id="dashboard-next-action-heading" className="text-lg font-semibold text-foreground">
          Direkteinstieg
        </h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
          Wähle Lernziel und Arbeitsweise. Die Empfehlung bleibt regelbasiert; ein begonnenes
          Training hat weiterhin Vorrang.
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2" data-dashboard-quick-start="true">
        <div className="rounded-xl border border-border bg-card p-5">
          <fieldset>
            <legend className="text-sm font-semibold text-foreground">1. Lernziel</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {learningGoals.map((option) => (
                <label
                  key={option.value}
                  className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-3 text-sm transition-colors has-[:checked]:border-ring has-[:checked]:bg-muted/70 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
                >
                  <input
                    type="radio"
                    name="dashboard-learning-goal"
                    value={option.value}
                    checked={goal === option.value}
                    onChange={() => setGoal(option.value)}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">{option.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 rounded-lg border border-border bg-muted/30 px-3 py-3">
            <p className="text-sm font-semibold text-foreground">2. Selbsteinschätzung</p>
            {effectiveAiLevel ? (
              <>
                <p className="mt-1 text-sm text-foreground" data-quick-start-ai-level="true">
                  {aiLevelLabel(effectiveAiLevel)}
                  {preferences.selfAssessedAiLevel === null ? " (Einstiegs-Default)" : ""}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Dieser Wert wird nur aus deinen bestehenden Einstellungen gelesen. Ändern kannst
                  du ihn über „KI-Level“ in der Plattform-Navigation; der Direkteinstieg speichert
                  keine Einstufung automatisch.
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground" role="status">
                {preferences.status === "error"
                  ? "Selbsteinschätzung ist derzeit nicht verfügbar."
                  : "Selbsteinschätzung wird geladen …"}
              </p>
            )}
          </div>

          <fieldset className="mt-5">
            <legend className="text-sm font-semibold text-foreground">3. Arbeitsweise</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {workStyles.map((option) => (
                <label
                  key={option.value}
                  className="flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-3 text-sm transition-colors has-[:checked]:border-ring has-[:checked]:bg-muted/70 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
                >
                  <input
                    type="radio"
                    name="dashboard-work-style"
                    value={option.value}
                    checked={preferredMode === option.value}
                    onChange={() => setPreferredMode(option.value)}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">{option.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="min-w-0 rounded-xl border border-ring/60 bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-accent">
            {recommendation?.primaryAction?.kind === "resume" ? (
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            Deine Empfehlung
          </div>

          {loading ? (
            <p className="mt-3 text-sm text-muted-foreground" role="status">
              Lernempfehlung wird ermittelt …
            </p>
          ) : recommendation?.primaryAction ? (
            <>
              <h3 className="mt-3 text-base font-semibold text-foreground">
                {recommendation.primaryAction.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {recommendation.explanation}
              </p>

              {recommendation.path.length > 1 ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Empfohlener Lernpfad
                  </p>
                  <ol className="mt-2 space-y-2">
                    {recommendation.path.map((item, index) => (
                      <li
                        key={item.scenarioId}
                        className="flex min-w-0 items-start gap-2 text-sm text-foreground"
                      >
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-semibold"
                          aria-hidden="true"
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0 break-words">
                          {item.title}
                          <span className="ml-1 text-xs text-muted-foreground">
                            · {modeLabel(item.mode)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              <Link
                to="/training/$scenarioId"
                params={{ scenarioId: recommendation.primaryAction.scenarioId }}
                data-primary-dashboard-action="true"
                className="mt-5 inline-flex max-w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span className="truncate">
                  {recommendation.primaryAction.kind === "resume"
                    ? "Fortsetzen"
                    : "Als Nächstes starten"}
                  : {recommendation.primaryAction.title}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </Link>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground" role="status">
              Aktuell ist für diese Auswahl keine passende Trainingsaktion verfügbar.
            </p>
          )}
        </div>
      </div>

      {resumeStatus === "error" ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground" role="status">
          Einzelne gespeicherte Trainings konnten nicht gelesen werden. Verfügbare Arbeitsstände und
          die Lernempfehlung bleiben nutzbar.
        </p>
      ) : null}

      {otherResumable.length > 0 ? (
        <div className="mt-4 rounded-xl border border-border bg-card/60 p-4">
          <h3 className="text-sm font-semibold text-foreground">Weitere angefangene Trainings</h3>
          <ul className="mt-2 space-y-1">
            {otherResumable.map((candidate) => (
              <li key={candidate.scenarioId}>
                <Link
                  to="/training/$scenarioId"
                  params={{ scenarioId: candidate.scenarioId }}
                  className="inline-flex rounded-md px-1 py-1 text-sm text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Fortsetzen: {candidate.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
