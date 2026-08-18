import { useEffect, useMemo, useState } from "react";
import { restoreTrainingSession, type TrainingSubjectRef } from "@ai-train-lab/training-engine";
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
  recommendationCandidatesExcluding,
} from "./dashboardRecommendationContext";

export type ResumeLoadStatus = "loading" | "ready" | "error";

export function useTrainingRecommendation({
  excludeStartScenarioId,
  skillProfilesRefreshKey,
}: {
  excludeStartScenarioId?: string;
  skillProfilesRefreshKey?: unknown;
} = {}) {
  const auth = useAuth();
  const skillProfiles = useSkillProfiles(skillProfilesRefreshKey);
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

  const recommendationLoading = shouldWaitForDashboardRecommendation({
    resumeLoading: resumeStatus === "loading",
    hasResumable: resumable.length > 0,
    skillProfilesLoading: skillProfiles.status === "loading",
  });
  const primaryAction = recommendationLoading
    ? null
    : selectPrimaryDashboardAction({
        resumable,
        trainingCandidates: recommendationCandidatesExcluding(excludeStartScenarioId),
        authoritativeProfiles: skillProfiles.status === "ready" ? skillProfiles.profiles : null,
      });

  return {
    primaryAction,
    recommendationLoading,
    resumable,
    resumeStatus,
    skillProfiles,
  };
}
