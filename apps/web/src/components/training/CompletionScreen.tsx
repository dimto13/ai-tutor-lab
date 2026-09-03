import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Award,
  CheckCircle2,
  ExternalLink,
  LayoutGrid,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import {
  SCORE_MODE_MULTIPLIER,
  type AppendScoreEventResult,
  type SkillLevel,
} from "@ai-train-lab/training-engine";
import { FeedbackCapture } from "@/components/feedback/FeedbackCapture";
import {
  completionCompetencyPresentation,
  completionRecommendationRefreshKey,
  completionScorePresentation,
  shouldWaitForCompletionRecommendation,
  type SkillProfileChange,
} from "@/completion/completionOutcome";
import { technologyCatalog } from "@/catalog";
import { useTrainingRecommendation } from "@/dashboard/useTrainingRecommendation";
import {
  useScenarioScoreAward,
  type ScenarioScoreAwardStatus,
} from "@/scoring/useScenarioScoreAward";
import { scoredTechnologyIdForScenario } from "@/skill-profile/skillProfilePolicy";
import { useLocalizedScenario } from "@/i18n/useLocalizedScenario";
import { useSkillProfiles, type SkillProfilesState } from "@/skill-profile/useSkillProfiles";
import { useTraining } from "@/state/trainingStore";

const levelLabels: Record<SkillLevel, string> = {
  novice: "Novice",
  advanced_beginner: "Advanced Beginner",
  practitioner: "Practitioner",
  proficient: "Proficient",
};

function technologyName(technologyId: string): string {
  return (
    technologyCatalog.technologies.find((technology) => technology.id === technologyId)?.name ??
    technologyId
  );
}

export function CompletionScreen() {
  const { scenario: canonicalScenario, mode, progress, restart, completedCount } = useTraining();
  const scenario = useLocalizedScenario(canonicalScenario);
  const competencyBaseline = useSkillProfiles();
  const scoreFinishedAt = competencyBaseline.status === "loading" ? null : progress.finishedAt;
  const score = useScenarioScoreAward(scenario.id, mode, scoreFinishedAt);
  const recommendationRefreshKey = completionRecommendationRefreshKey(score.status, score.result);
  const recommendationFreshnessBaseline =
    competencyBaseline.status === "ready" &&
    (score.status !== "ready" ||
      !score.result?.created ||
      (competencyBaseline.profiles.length > 0 &&
        competencyBaseline.profiles.every(
          (profile) => profile.calculatedAt < score.result!.event.occurredAt,
        )))
      ? competencyBaseline.profiles
      : null;
  const recommendation = useTrainingRecommendation({
    excludeStartScenarioId: scenario.id,
    skillProfilesRefreshKey: recommendationRefreshKey,
    skillProfilesFreshnessBaseline: recommendationFreshnessBaseline,
    freshnessTechnologyId: scoredTechnologyIdForScenario(scenario.id),
  });
  const recommendationLoading = shouldWaitForCompletionRecommendation(
    score.status,
    score.result,
    recommendation.recommendationLoading,
  );
  const scorePresentation = completionScorePresentation(score.status, score.result);
  const minutes = Math.max(
    1,
    Math.round((((progress.finishedAt ?? Date.now()) - progress.startedAt) / 60000) * 10) / 10,
  );
  const unitLabel = mode === "explore" ? "Erkundung" : mode === "challenge" ? "Ziel" : "Schritte";
  const unitValue =
    mode === "explore"
      ? `${completedCount} von ${scenario.exploreTargets?.length ?? completedCount} Bereichen`
      : mode === "challenge"
        ? "1 von 1 erfüllt"
        : `${completedCount} von ${scenario.steps.length}`;

  return (
    <main
      aria-labelledby="completion-title"
      className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-6 sm:px-8 sm:py-8"
    >
      <section className="mx-auto w-full max-w-2xl rounded-2xl border border-border bg-card p-5 text-center shadow-2xl sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
          <Award className="h-7 w-7 text-success" aria-hidden="true" />
        </div>
        <h1
          id="completion-title"
          className="mt-5 text-2xl font-semibold tracking-tight text-foreground"
        >
          Training abgeschlossen
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{scenario.title}</p>

        <section className="mt-7 text-left" aria-labelledby="completion-results-heading">
          <h2 id="completion-results-heading" className="text-lg font-semibold text-foreground">
            Deine Auswertung
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Die Trainingsdaten stammen aus deinem gespeicherten Lauf. Punkte werden ausschließlich
            durch die serverseitige Scoring-Pipeline bestätigt.
          </p>

          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { label: unitLabel, value: unitValue },
              { label: "Dauer", value: `${minutes} Min.` },
              { label: "Modus", value: `${mode} ×${SCORE_MODE_MULTIPLIER[mode]}` },
              { label: "Punkte", value: scorePresentation.value },
              { label: "Hinweise", value: String(progress.hintsUsed) },
              { label: "Fehlversuche", value: String(progress.mistakes) },
            ].map((metric) => (
              <div
                key={metric.label}
                className="min-w-0 rounded-lg border border-border bg-panel p-3"
              >
                <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {metric.label}
                </dt>
                <dd className="mt-1 break-words text-sm font-medium text-foreground">
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>

          {score.status === "ready" && score.result ? (
            <div className="mt-4 rounded-xl border border-border bg-panel p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                Serverwertung · Szenario-Version {score.result.event.scenarioVersion}
              </p>
              {score.result.created ? (
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  Basis {score.result.event.breakdown.basePoints} + Bonus{" "}
                  {score.result.event.breakdown.bonusPoints} − Hinweisabzug{" "}
                  {score.result.event.breakdown.bonusDeductionPoints}, anschließend ×
                  {score.result.event.breakdown.modeMultiplier}. Vergeben:{" "}
                  <span className="font-medium text-foreground">
                    {score.result.event.points} Punkte
                  </span>
                  .
                </p>
              ) : (
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  Diese Szenario-Version wurde bereits gewertet. Der aktuelle Durchlauf bleibt als
                  Übung möglich, erzeugt aber keine weiteren Punkte. Das bestehende Ledger-Ereignis
                  bleibt unverändert bei {score.result.event.points} Punkten.
                </p>
              )}
            </div>
          ) : null}

          {score.status === "pending" || score.status === "idle" ? (
            <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground" role="status">
              Der Abschluss wird serverseitig geprüft und dem Punkte-Ledger zugeordnet.
            </p>
          ) : null}

          {score.status === "error" ? (
            <div className="mt-4 rounded-xl border border-border bg-panel p-4">
              <p className="text-[13px] leading-relaxed text-muted-foreground" role="status">
                Der Trainingsabschluss ist gespeichert, die Serverwertung konnte aber noch nicht
                bestätigt werden. Es werden keine lokalen Ersatzpunkte berechnet.
              </p>
              <button
                type="button"
                onClick={score.retry}
                className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
              >
                Serverwertung erneut prüfen
              </button>
            </div>
          ) : null}

          {score.status === "unavailable" ? (
            <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground" role="status">
              Im lokalen Trainingsmodus werden bewusst keine autoritativen Punkte vergeben.
            </p>
          ) : null}
        </section>

        <CompletionCompetencySection
          scoreStatus={score.status}
          scoreResult={score.result}
          baseline={competencyBaseline}
        />

        <section className="mt-7 text-left" aria-labelledby="completion-next-heading">
          <h2 id="completion-next-heading" className="text-lg font-semibold text-foreground">
            Dein nächster Schritt
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Die Folgeaktion verwendet dieselbe deterministische Empfehlungspolitik wie dein
            Dashboard. Angefangene Trainings haben dabei Vorrang.
          </p>

          {recommendationLoading ? (
            <div className="mt-4 rounded-xl border border-border bg-panel p-4" role="status">
              <p className="text-sm text-muted-foreground">Nächster Schritt wird ermittelt …</p>
            </div>
          ) : recommendation.primaryAction ? (
            <article className="mt-4 rounded-xl border border-ring/60 bg-panel p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-accent">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Empfohlene Folgeaktion
              </div>
              <h3 className="mt-2 text-base font-semibold text-foreground">
                {recommendation.primaryAction.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {recommendation.primaryAction.reason}
              </p>
              <Link
                to="/training/$scenarioId"
                params={{ scenarioId: recommendation.primaryAction.scenarioId }}
                data-primary-completion-action="true"
                className="mt-4 inline-flex max-w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
              >
                <span className="min-w-0 break-words text-left">
                  {recommendation.primaryAction.kind === "resume" ? "Fortsetzen" : "Starten"}:{" "}
                  {recommendation.primaryAction.title}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </Link>
            </article>
          ) : (
            <div className="mt-4 rounded-xl border border-ring/60 bg-panel p-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Aktuell ist kein weiteres Training eindeutig priorisierbar. Öffne die Übersicht, um
                den vollständigen Katalog und dein Kompetenzprofil zu sehen.
              </p>
              <Link
                to="/"
                data-primary-completion-action="true"
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
              >
                Zur Trainingsübersicht
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          )}

          {recommendation.resumeStatus === "error" ? (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground" role="status">
              Einzelne gespeicherte Trainings konnten für die Empfehlung nicht gelesen werden. Die
              verfügbare Folgeaktion bleibt deterministisch auf Basis der übrigen Daten.
            </p>
          ) : null}
        </section>

        {mode === "challenge" && scenario.solutionComparison?.length ? (
          <section
            className="mt-7 rounded-xl border border-border bg-panel p-4 text-left"
            aria-labelledby="completion-solution-heading"
          >
            <h2
              id="completion-solution-heading"
              className="text-[11px] font-semibold uppercase tracking-wider text-accent"
            >
              Lösungsvergleich
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Dein Klickweg durfte frei sein. Ein möglicher sauberer Lösungsweg sieht so aus:
            </p>
            <ol className="mt-3 space-y-2">
              {scenario.solutionComparison.map((item) => (
                <li key={item} className="flex gap-2 text-[13px] leading-relaxed text-foreground">
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-success"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {scenario.resources?.length ? (
          <section
            className="mt-7 rounded-xl border border-border bg-panel p-4 text-left"
            aria-labelledby="completion-resources-heading"
          >
            <h2
              id="completion-resources-heading"
              className="text-[11px] font-semibold uppercase tracking-wider text-accent"
            >
              Weiterführende Quellen
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Diese Links werden als Content-Metadaten gepflegt und können unabhängig von der
              Oberfläche aktualisiert werden.
            </p>
            <ul className="mt-3 space-y-2">
              {scenario.resources.map((resource) => (
                <li key={resource.url}>
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ExternalLink
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block break-words text-[13px] font-medium text-foreground">
                        {resource.title}
                      </span>
                      {resource.description ? (
                        <span className="mt-1 block break-words text-[12px] leading-relaxed text-muted-foreground">
                          {resource.description}
                        </span>
                      ) : null}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section
          className="mt-7 rounded-xl border border-accent/30 bg-accent/10 p-4"
          aria-labelledby="completion-feedback-heading"
        >
          <h2 id="completion-feedback-heading" className="text-sm font-medium text-foreground">
            War dieses Training verständlich?
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Dein Feedback wird mit dem Trainingskontext gespeichert, ohne deinen Abschluss zu
            verändern.
          </p>
          <div className="mt-3 flex justify-center">
            <FeedbackCapture source="completion" triggerLabel="Feedback zum Training geben" />
          </div>
        </section>

        <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={restart}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-ring hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Training erneut starten
          </button>
          {!recommendationLoading && recommendation.primaryAction ? (
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:border-ring hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" /> Zur Übersicht
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function CompletionCompetencySection({
  scoreStatus,
  scoreResult,
  baseline,
}: {
  scoreStatus: ScenarioScoreAwardStatus;
  scoreResult: AppendScoreEventResult | null;
  baseline: SkillProfilesState;
}) {
  return (
    <section className="mt-7 text-left" aria-labelledby="completion-competency-heading">
      <h2 id="completion-competency-heading" className="text-lg font-semibold text-foreground">
        Kompetenzveränderung
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        Hier wird ausschließlich das serverseitig bestätigte Kompetenzprofil verglichen. Aus der
        lokalen Punktanzeige wird keine Kompetenzstufe abgeleitet.
      </p>

      {scoreStatus === "ready" && scoreResult ? (
        <PostAwardCompetency baseline={baseline} scoreResult={scoreResult} />
      ) : (
        <CompetencyStatusBeforeAward scoreStatus={scoreStatus} />
      )}
    </section>
  );
}

function CompetencyStatusBeforeAward({ scoreStatus }: { scoreStatus: ScenarioScoreAwardStatus }) {
  const text =
    scoreStatus === "unavailable"
      ? "Im lokalen Trainingsmodus ist kein autoritatives Kompetenzprofil verfügbar."
      : scoreStatus === "error"
        ? "Die Kompetenzveränderung kann erst nach einer bestätigten Serverwertung geprüft werden."
        : "Die Kompetenzveränderung wird nach der bestätigten Serverwertung abgeglichen.";
  return (
    <div className="mt-4 rounded-xl border border-border bg-panel p-4" role="status">
      <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function PostAwardCompetency({
  baseline,
  scoreResult,
}: {
  baseline: SkillProfilesState;
  scoreResult: AppendScoreEventResult;
}) {
  const [refreshToken, setRefreshToken] = useState(0);
  const current = useSkillProfiles(refreshToken);
  const presentation = completionCompetencyPresentation({
    scoreStatus: "ready",
    scoreResult,
    baseline,
    current,
  });

  if (presentation.kind === "loading") {
    return (
      <div className="mt-4 rounded-xl border border-border bg-panel p-4" role="status">
        <p className="text-sm text-muted-foreground">Kompetenzprofil wird aktualisiert …</p>
      </div>
    );
  }

  if (presentation.kind === "unavailable") {
    return (
      <div className="mt-4 rounded-xl border border-border bg-panel p-4" role="status">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Ein autoritativer Kompetenzabgleich ist in diesem Modus nicht verfügbar.
        </p>
      </div>
    );
  }

  if (presentation.kind === "error") {
    return (
      <div className="mt-4 rounded-xl border border-border bg-panel p-4" role="status">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Das aktuelle Kompetenzprofil konnte nicht geladen werden. Es wird keine Veränderung
          geschätzt.
        </p>
        <CompetencyRefreshButton onClick={() => setRefreshToken((value) => value + 1)} />
      </div>
    );
  }

  if (presentation.kind === "already_awarded") {
    return (
      <div className="mt-4 rounded-xl border border-border bg-panel p-4" role="status">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Diese Szenario-Version war bereits gewertet. Dieser Wiederholungsdurchlauf erzeugt daher
          keine neue Kompetenzveränderung; die bestehende Punktzahl und das Kompetenzprofil bleiben
          vom erneuten Start unberührt.
        </p>
      </div>
    );
  }

  if (presentation.kind === "current_only") {
    return (
      <div className="mt-4 rounded-xl border border-border bg-panel p-4" role="status">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Der aktuelle serverseitig bestätigte Kompetenzstand ist verfügbar, aber es lag vor der
          Wertung kein zeitlich belastbarer Vergleichsstand vor. Deshalb wird keine Veränderung
          behauptet.
        </p>
        <Link
          to="/kompetenz"
          className="mt-3 inline-flex rounded-md text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Aktuelles Kompetenzprofil ansehen
        </Link>
      </div>
    );
  }

  if (presentation.kind === "projection_pending") {
    return (
      <div className="mt-4 rounded-xl border border-border bg-panel p-4" role="status">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Die Punktevergabe ist bestätigt, die serverseitige Kompetenzprojektion zeigt aber noch
          keinen belastbaren neuen Stand. Der Abgleich bleibt deshalb ausstehend.
        </p>
        <CompetencyRefreshButton onClick={() => setRefreshToken((value) => value + 1)} />
      </div>
    );
  }

  if (presentation.kind === "changed") {
    return (
      <div className="mt-4 rounded-xl border border-border bg-panel p-4" role="status">
        <ul className="space-y-3">
          {presentation.changes.map((change) => (
            <li key={change.technologyId}>
              <CompetencyChangeLine change={change} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-panel p-4" role="status">
      <p className="text-sm text-muted-foreground">
        Die Kompetenzveränderung wird nach der bestätigten Serverwertung abgeglichen.
      </p>
    </div>
  );
}

function CompetencyRefreshButton({ onClick }: { onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
    >
      Kompetenzprofil erneut prüfen
    </button>
  );
}

function CompetencyChangeLine({ change }: { change: SkillProfileChange }) {
  const name = technologyName(change.technologyId);
  const beforeLabel = change.before ? levelLabels[change.before.level] : "Noch kein Nachweis";
  const afterLabel = change.after ? levelLabels[change.after.level] : "Kein aktueller Nachweis";

  if (!change.after) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">{name}:</span> Der aktuelle Nachweis ist nicht
        mehr verfügbar; eine positive Veränderung wird nicht behauptet.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium text-foreground">{name}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        {change.levelChanged ? (
          <>
            Kompetenzstufe: <span className="text-foreground">{beforeLabel}</span> →{" "}
            <span className="font-medium text-foreground">{afterLabel}</span>.
          </>
        ) : (
          <>
            Kompetenzstufe unverändert:{" "}
            <span className="font-medium text-foreground">{afterLabel}</span>.
          </>
        )}{" "}
        {change.pointsChanged && change.before
          ? `Bestätigte Kompetenzpunkte: ${change.before.points} → ${change.after.points}.`
          : change.evidenceRevisionChanged
            ? "Der serverseitige Nachweis wurde nach dem Abschluss aktualisiert."
            : ""}
      </p>
    </div>
  );
}
