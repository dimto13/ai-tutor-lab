import { technologyCatalog } from "@/catalog";
import { getScenario, getScenarioIds } from "@/scenarios";
import {
  dashboardStarterScenarioIds,
  type DashboardTrainingCandidate,
} from "./dashboardRecommendation";

export function buildDashboardTrainingCandidates(
  scenarioIds: readonly string[],
): DashboardTrainingCandidate[] {
  return scenarioIds.flatMap((scenarioId) => {
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

export const allDashboardTrainingCandidates = buildDashboardTrainingCandidates(getScenarioIds());
export const dashboardRecommendationCandidates = buildDashboardTrainingCandidates(
  dashboardStarterScenarioIds,
);

export function recommendationCandidatesExcluding(
  scenarioId?: string,
): readonly DashboardTrainingCandidate[] {
  return scenarioId
    ? dashboardRecommendationCandidates.filter((candidate) => candidate.scenarioId !== scenarioId)
    : dashboardRecommendationCandidates;
}
