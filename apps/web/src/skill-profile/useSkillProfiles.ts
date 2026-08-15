import { useEffect, useMemo, useState } from "react";
import type { SkillProfileProjection } from "@ai-train-lab/training-engine";
import { createApplicationSkillProfileService } from "./applicationSkillProfileService";

export type SkillProfilesStatus = "unavailable" | "loading" | "ready" | "error";

export interface SkillProfilesState {
  status: SkillProfilesStatus;
  profiles: SkillProfileProjection[];
  error: string | null;
}

export function useSkillProfiles(): SkillProfilesState {
  const service = useMemo(() => createApplicationSkillProfileService(), []);
  const [status, setStatus] = useState<SkillProfilesStatus>(service ? "loading" : "unavailable");
  const [profiles, setProfiles] = useState<SkillProfileProjection[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!service) {
      setStatus("unavailable");
      setProfiles([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setError(null);

    void service
      .listSkillProfiles()
      .then((result) => {
        if (cancelled) return;
        setProfiles(result);
        setStatus("ready");
        setError(null);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setProfiles([]);
        setStatus("error");
        setError(reason instanceof Error ? reason.message : "Kompetenzprofil konnte nicht geladen werden");
      });

    return () => {
      cancelled = true;
    };
  }, [service]);

  return { status, profiles, error };
}
