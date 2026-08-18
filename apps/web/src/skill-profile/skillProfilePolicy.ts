import skillProfilePolicy from "../../../../content/scoring/skill-profile-policy.json";

export function scoredTechnologyIdForScenario(scenarioId: string): string | null {
  for (const technology of skillProfilePolicy.technologies) {
    if (technology.scenarioIds.includes(scenarioId)) return technology.technologyId;
  }
  return null;
}
