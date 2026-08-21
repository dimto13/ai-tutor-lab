import { Link } from "@tanstack/react-router";
import type { SkillLevel } from "@ai-train-lab/training-engine";
import { technologyCatalog } from "@/catalog";
import { DashboardQuickStart } from "@/components/dashboard/DashboardQuickStart";
import { WeeklyContinuityCard } from "@/components/dashboard/WeeklyContinuityCard";
import { useTrainingRecommendation } from "@/dashboard/useTrainingRecommendation";
import type { SkillProfilesState } from "@/skill-profile/useSkillProfiles";

const levelLabels: Record<SkillLevel, string> = {
  novice: "Novice",
  advanced_beginner: "Advanced Beginner",
  practitioner: "Practitioner",
  proficient: "Proficient",
};

export function DashboardLearningOverview() {
  const { primaryAction, recommendationLoading, resumable, resumeStatus, skillProfiles } =
    useTrainingRecommendation();

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

      <WeeklyContinuityCard />

      <DashboardQuickStart
        basePrimaryAction={primaryAction}
        recommendationLoading={recommendationLoading}
        resumable={resumable}
        resumeStatus={resumeStatus}
      />
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
