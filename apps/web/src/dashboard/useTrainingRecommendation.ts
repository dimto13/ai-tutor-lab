import { useEffect, useMemo, useRef, useState } from "react";
import {
  restoreTrainingSession,
  type SkillProfileProjection,
  type TrainingSubjectRef,
} from "@ai-train-lab/training-engine";
import { useAuth } from "@/auth/AuthContext";
import { createApplicationTrainingStateRepository } from "@/persistence/applicationTrainingStateRepository";
import { getScenario } from "@/scenarios";
import { useSkillProfiles } from "@/skill-profile/useSkillProfiles";
import {
  selectPrimaryDashboardAction,
  shouldWaitForDashboardRecommendation,
  sortResumeCandidates,
  type DashboardResumeCandidate,
} from "./dashboardRecommendation";
import {
  allDashboardTrainingCandidates,
  buildDashboardTrainingCandidates,
  recommendationCandidatesExcluding,
} from "./dashboardRecommendationContext";
import {
  materialSkillProfileEvidenceChanged,
  RECOMMENDATION_PROFILE_AUTO_REFRESH_ATTEMPTS,
  recommendationProfileRetryDelayMs,
  requiresFreshRecommendationEvidence,
} from "./recommendationProfileFreshness";

export type ResumeLoadStatus = "loading" | "ready" | "error";

export function useTrainingRecommendation({
  excludeStartScenarioId,
  skillProfilesRefreshKey,
}: {
  excludeStartScenarioId?: string;
  skillProfilesRefreshKey?: unknown;
} = {}) {
  const auth = useAuth();
  const [profileRefreshAttempt, setProfileRefreshAttempt] = useState(0);
  const effectiveSkillProfilesRefreshKey = useMemo(
    () => ({ external: skillProfilesRefreshKey, attempt: profileRefreshAttempt }),
    [profileRefreshAttempt, skillProfilesRefreshKey],
  );
  const skillProfiles = useSkillProfiles(effectiveSkillProfilesRefreshKey);
  const lastReadyProfilesRef = useRef<SkillProfileProjection[] | null>(null);
  const freshnessBaselineRef = useRef<SkillProfileProjection[] | null>(null);
  const previousRefreshKeyRef = useRef(skillProfilesRefreshKey);
  const subject = useMemo<TrainingSubjectRef | null>(() => {
    if (!auth.session) return null;
    return {
      userId: auth.session.identity.userId,
      tenantId: auth.session.identity.tenantId,
    };
  }, [auth.session]);
  const refreshTechnologyId = useMemo(
    () =>
      excludeStartScenarioId
        ? (buildDashboardTrainingCandidates([excludeStartScenarioId])[0]?.technologyId ?? null)
        : null,
    [excludeStartScenarioId],
  );
  const [resumeStatus, setResumeStatus] = useState<ResumeLoadStatus>("loading");
  const [resumable, setResumable] = useState<DashboardResumeCandidate[]>([]);

  useEffect(() => {
    if (Object.is(previousRefreshKeyRef.current, skillProfilesRefreshKey)) return;

    freshnessBaselineRef.current = requiresFreshRecommendationEvidence(skillProfilesRefreshKey)
      ? lastReadyProfilesRef.current
        ? [...lastReadyProfilesRef.current]
        : null
      : null;
    previousRefreshKeyRef.current = skillProfilesRefreshKey;
    setProfileRefreshAttempt(0);
  }, [skillProfilesRefreshKey]);

  useEffect(() => {
    if (skillProfiles.status === "ready") {
      lastReadyProfilesRef.current = skillProfiles.profiles;
    }
  }, [skillProfiles]);

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
      allDashboardTrainingCandidates.map(async (candidate) => {
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
      const eligible = excludeStartScenarioId
        ? loaded.filter((candidate) => candidate.scenarioId !== excludeStartScenarioId)
        : loaded;
      setResumable(sortResumeCandidates(eligible));
      setResumeStatus(results.some((result) => result.failed) ? "error" : "ready");
    });

    return () => {
      cancelled = true;
    };
  }, [auth.status, excludeStartScenarioId, subject]);

  const freshEvidenceRequired = requiresFreshRecommendationEvidence(skillProfilesRefreshKey);
  const freshEvidenceObserved =
    !freshEvidenceRequired ||
    (freshnessBaselineRef.current !== null &&
      skillProfiles.status === "ready" &&
      materialSkillProfileEvidenceChanged(
        freshnessBaselineRef.current,
        skillProfiles.profiles,
        refreshTechnologyId,
      ));
  const canRetryFreshEvidence =
    freshEvidenceRequired &&
    !freshEvidenceObserved &&
    resumable.length === 0 &&
    skillProfiles.status !== "loading" &&
    skillProfiles.status !== "unavailable" &&
    profileRefreshAttempt < RECOMMENDATION_PROFILE_AUTO_REFRESH_ATTEMPTS;

  useEffect(() => {
    if (!canRetryFreshEvidence) return;
    const timer = window.setTimeout(
      () => setProfileRefreshAttempt((current) => current + 1),
      recommendationProfileRetryDelayMs(profileRefreshAttempt),
    );
    return () => window.clearTimeout(timer);
  }, [canRetryFreshEvidence, profileRefreshAttempt]);

  const freshnessPending =
    freshEvidenceRequired &&
    !freshEvidenceObserved &&
    resumable.length === 0 &&
    (skillProfiles.status === "loading" || canRetryFreshEvidence);

  const baseRecommendationLoading = shouldWaitForDashboardRecommendation({
    resumeLoading: resumeStatus === "loading",
    hasResumable: resumable.length > 0,
    skillProfilesLoading: skillProfiles.status === "loading",
  });
  const basePrimaryAction = baseRecommendationLoading
    ? null
    : selectPrimaryDashboardAction({
        resumable,
        trainingCandidates: recommendationCandidatesExcluding(excludeStartScenarioId),
        authoritativeProfiles: skillProfiles.status === "ready" ? skillProfiles.profiles : null,
      });
  const recommendationLoading = baseRecommendationLoading || freshnessPending;
  const primaryAction =
    recommendationLoading ||
    (freshEvidenceRequired && !freshEvidenceObserved && basePrimaryAction?.kind !== "resume")
      ? null
      : basePrimaryAction;

  return {
    primaryAction,
    recommendationLoading,
    resumable,
    resumeStatus,
    skillProfiles,
  };
}
