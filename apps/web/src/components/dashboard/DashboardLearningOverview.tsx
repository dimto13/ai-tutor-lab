import { Link } from "@tanstack/react-router";
import { ArrowRight, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  restoreTrainingSession,
  type SkillLevel,
  type TrainingSubjectRef,
} from "@ai-train-lab/training-engine";
import { useAuth } from "@/auth/AuthContext";
import { technologyCatalog } from "@/catalog";
import { createApplicationTrainingStateRepository } from "@/persistence/applicationTrainingStateRepository";
import { getScenario, getScenarioIds } from "@/scenarios";
import { useSkillProfiles, type SkillProfilesState } from "@/skill-profile/useSkillProfiles";
import {
  selectPrimaryDashboardAction,
  shouldWaitForDashboardRecommendation,
  sortResumeCandidates,
  type DashboardResumeCandidate,
  type DashboardTrainingCandidate,
} from "@/dashboard/dashboardRecommendation";

const levelLabels: Record<SkillLevel, string> = {
  novice: "Novice",
  advanced_beginner: "Advanced Beginner",
  practitioner: "Practitioner",
  proficient: "Proficient",
};

type ResumeLoadStatus = "loading" | "ready" | "error";

function trainingCandidates(): DashboardTrainingCandidate[] {
  return getScenarioIds().flatMap((scenarioId) => {
    const scenario = getScenario(scenarioId);
    if (!scenario) return [];

    const toolIntegrationProductId =
      scenario.learningLayer === "tool" && scenario.environment?.integrations?.length === 1
        ? scenario.environment.integrations[0]?.productId
        : undefined;
    const competencyProductId = toolIntegrationProductId ?? scenario.environment?.productId;
    const product = competencyProductId
      ? technologyCatalog.products.find((candidate) => candidate.id === competencyProductId)
      : undefined;
    const technology = product
      ? technologyCatalog.technologies.find((candidate) => candidate.id === product.technologyId)
      : undefined;

    return [
      {
        scenarioId: scenario.id,
        title: scenario.title,
        mode: scenario.mode ?? "guided",
        learningLayer: scenario.learningLayer ?? null,
        technologyId: technology?.id ?? null,
        technologyName: technology?.name ?? null,
      },
    ];
  });
}

const candidates = trainingCandidates();

export function DashboardLearningOverview() {
  const auth = useAuth();
  const skillProfiles = useSkillProfiles();
  const subject = useMemo<TrainingSubjectRef | null>(() => {
    if (!auth.session) return null;
    return {
      userId: auth.session.identity.userId,
      tenantId: auth.session.identity.tenantId,
    };
  }, [auth.session]);
  const [resumeStatus, setResumeStatus] = useState<ResumeLoadStatus>("loading");
  const [resumable, setResumable] = useState<DashboardResumeCandidate[]>([]);

  useEffect(() => {
    let cancelled = false;

    if (auth.status === "loading") {
      setResumeStatus("loading");
      return () => {
        cancelled = true;
      };
    }

    if (!subject) {
      setResumable([]);
      setResumeStatus("ready");
      return () => {
        cancelled = true;
      };
    }

    setResumeStatus("loading");
    const repository = createApplicationTrainingStateRepository();

    void Promise.all(
      candidates.map(async (candidate) => {
        const scenario = getScenario(candidate.scenarioId);
        if (!scenario) return { resume: null, failed: false };

        try {
          const record = await repository.loadSession({
            subject,
            scenarioId: scenario.id,
            mode: scenario.mode ?? "guided",
          });
          if (!record) return { resume: null, failed: false };

          const session = restoreTrainingSession(
            scenario,
            scenario.id,
            record.value,
            Date.now(),
            subject,
          );
          if (session.finishedAt !== null || session.challengeOutcome === "timed_out") {
            return { resume: null, failed: false };
          }

          const activeStepTitle = session.activeStepId
            ? (scenario.steps.find((step) => step.id === session.activeStepId)?.title ?? null)
            : null;
          return {
            resume: {
              ...candidate,
              updatedAt: record.updatedAt,
              activeStepTitle,
            } satisfies DashboardResumeCandidate,
            failed: false,
          };
        } catch {
          return { resume: null, failed: true };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const loaded = results.flatMap((result) => (result.resume ? [result.resume] : []));
      setResumable(sortResumeCandidates(loaded));
      setResumeStatus(results.some((result) => result.failed) ? "error" : "ready");
    });

    return () => {
      cancelled = true;
    };
  }, [auth.status, subject]);

  const recommendationLoading = shouldWaitForDashboardRecommendation({
    resumeLoading: resumeStatus === "loading",
    hasResumable: resumable.length > 0,
    skillProfilesLoading: skillProfiles.status === "loading",
  });
  const primaryAction = recommendationLoading
    ? null
    : selectPrimaryDashboardAction({
        resumable,
        trainingCandidates: candidates,
        authoritativeProfiles: skillProfiles.status === "ready" ? skillProfiles.profiles : null,
      });
  const otherResumable = resumable.filter(
    (candidate) =>
      primaryAction?.kind !== "resume" || candidate.scenarioId !== primaryAction.scenarioId,
  );

  return (
    <div className="mt-8 space-y-6" data-dashboard-overview-ready={!recommendationLoading}>
      <section aria-labelledby="dashboard-competency-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="dashboard-competency-heading" className="text-lg font-semibold text-foreground">
              Dein Kompetenzprofil
            </h2>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
              Die Stufen stammen aus dem bestehenden serverseitig bestätigten Kompetenzprofil. Das
              Dashboard berechnet keine eigenen Punkte oder Kompetenzwerte.
            </p>
          </div>
          <Link
            to="/kompetenz"
            className="rounded-md text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Vollständiges Profil ansehen
          </Link>
        </div>

        <CompetencySummary state={skillProfiles} />
      </section>

      <section aria-labelledby="dashboard-next-action-heading">
        <div>
          <h2 id="dashboard-next-action-heading" className="text-lg font-semibold text-foreground">
            Dein nächster Schritt
          </h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
            Angefangene Trainings haben Vorrang. Ohne offenen Arbeitsstand wird deterministisch nach
            bestätigtem Kompetenzprofil und festem Grundlagen-Lernpfad priorisiert.
          </p>
        </div>

        {recommendationLoading ? (
          <div className="mt-4 rounded-xl border border-border bg-card p-5" role="status">
            <p className="text-sm text-muted-foreground">Nächster Schritt wird ermittelt …</p>
          </div>
        ) : primaryAction ? (
          <article className="mt-4 rounded-xl border border-ring/60 bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-accent">
              {primaryAction.kind === "resume" ? (
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              Primäre Empfehlung
            </div>
            <h3 className="mt-3 text-base font-semibold text-foreground">{primaryAction.title}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {primaryAction.reason}
            </p>
            <Link
              to="/training/$scenarioId"
              params={{ scenarioId: primaryAction.scenarioId }}
              data-primary-dashboard-action="true"
              className="mt-4 inline-flex max-w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span className="truncate">
                {primaryAction.kind === "resume" ? "Fortsetzen" : "Starten"}: {primaryAction.title}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          </article>
        ) : (
          <div className="mt-4 rounded-xl border border-border bg-card p-5" role="status">
            <p className="text-sm text-muted-foreground">
              Aktuell ist keine passende Trainingsaktion verfügbar.
            </p>
          </div>
        )}

        {resumeStatus === "error" ? (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground" role="status">
            Einzelne gespeicherte Trainings konnten nicht gelesen werden. Verfügbare Arbeitsstände
            und die Kompetenzempfehlung bleiben nutzbar.
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
    </div>
  );
}

function CompetencySummary({ state }: { state: SkillProfilesState }) {
  const profiles = new Map(state.profiles.map((profile) => [profile.technologyId, profile]));

  return (
    <div className="mt-4">
      <p className="text-xs text-muted-foreground" role="status">
        {state.status === "loading"
          ? "Kompetenzprofil wird geladen …"
          : state.status === "unavailable"
            ? "Im lokalen Modus nicht autoritativ verfügbar"
            : state.status === "error"
              ? "Kompetenzprofil konnte nicht geladen werden"
              : "Serverseitig berechnet"}
      </p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {technologyCatalog.technologies.map((technology) => {
          const profile = profiles.get(technology.id);
          return (
            <div
              key={technology.id}
              className="min-w-0 rounded-lg border border-border bg-card px-3 py-3"
            >
              <dt className="truncate text-xs text-muted-foreground">{technology.name}</dt>
              <dd className="mt-1 text-sm font-semibold text-foreground">
                {state.status === "ready"
                  ? profile
                    ? levelLabels[profile.level]
                    : "Noch kein Nachweis"
                  : "—"}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
