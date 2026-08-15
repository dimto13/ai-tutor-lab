import type { SkillLevel, SkillProfileProjection } from "@ai-train-lab/training-engine";
import { technologyCatalog } from "@/catalog";
import { useSkillProfiles, type SkillProfilesStatus } from "@/skill-profile/useSkillProfiles";

const levelLabels: Record<SkillLevel, string> = {
  novice: "Novice",
  advanced_beginner: "Advanced Beginner",
  practitioner: "Practitioner",
  proficient: "Proficient",
};

const pointsFormat = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function CompetencyMatrix() {
  const state = useSkillProfiles();
  const profiles = new Map(state.profiles.map((profile) => [profile.technologyId, profile]));

  return (
    <section className="mt-8" aria-labelledby="competency-profile-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="competency-profile-heading" className="text-base font-semibold text-foreground">
            Kompetenzprofil
          </h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
            Gemessene Praxis je Technologie. Punkte und Stufen entstehen ausschließlich aus
            serverseitig bestätigten Trainingsdaten; die persönliche Selbsteinschätzung bleibt
            davon getrennt.
          </p>
        </div>
        <ProfileStatus status={state.status} error={state.error} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {technologyCatalog.technologies.map((technology) => (
          <CompetencyCard
            key={technology.id}
            technologyName={technology.name}
            profile={profiles.get(technology.id) ?? null}
            status={state.status}
          />
        ))}
      </div>
    </section>
  );
}

function ProfileStatus({ status, error }: { status: SkillProfilesStatus; error: string | null }) {
  if (status === "loading") {
    return <span className="text-xs text-muted-foreground">Profil wird geladen …</span>;
  }
  if (status === "unavailable") {
    return (
      <span className="text-xs text-muted-foreground">
        Im lokalen Modus nicht autoritativ verfügbar
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="max-w-md text-right text-xs text-muted-foreground" title={error ?? undefined}>
        Kompetenzprofil konnte nicht geladen werden
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">Serverseitig berechnet</span>;
}

function CompetencyCard({
  technologyName,
  profile,
  status,
}: {
  technologyName: string;
  profile: SkillProfileProjection | null;
  status: SkillProfilesStatus;
}) {
  const ready = status === "ready" && profile !== null;

  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-foreground">{technologyName}</h3>
      <dl className="mt-4 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Punkte</dt>
          <dd className="font-medium text-foreground">
            {ready ? pointsFormat.format(profile.points) : "—"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Stufe</dt>
          <dd className="font-medium text-foreground">
            {ready ? levelLabels[profile.level] : "—"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Bestätigte Challenges</dt>
          <dd className="font-medium text-foreground">
            {ready ? profile.eligibleChallengeCount : "—"}
          </dd>
        </div>
      </dl>
      {status === "ready" && profile === null ? (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Für diese Technologie liegt noch kein serverseitiges Profil vor.
        </p>
      ) : null}
    </article>
  );
}
