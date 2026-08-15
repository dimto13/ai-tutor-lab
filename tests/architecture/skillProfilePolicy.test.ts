import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const policyUrl = new URL("../../content/scoring/skill-profile-policy.json", import.meta.url);
const technologyCatalogUrl = new URL(
  "../../content/catalog/technology-catalog.json",
  import.meta.url,
);
const scoringCatalogUrl = new URL(
  "../../content/scoring/scenario-score-catalog.json",
  import.meta.url,
);
const calculatorUrl = new URL("../../amplify/data/skill-profile-calculate.js", import.meta.url);

interface LevelPolicy {
  id: "novice" | "advanced_beginner" | "practitioner" | "proficient";
  minPoints: number;
  requiresEligibleChallenge: boolean;
}

interface TechnologyPolicy {
  technologyId: string;
  scenarioIds: string[];
}

interface SkillPolicy {
  schemaVersion: number;
  levels: LevelPolicy[];
  technologies: TechnologyPolicy[];
}

function parseJavascriptLiteral<T>(source: string, pattern: RegExp, label: string): T {
  const match = source.match(pattern);
  assert.ok(match?.[1], `Missing ${label} literal`);
  const jsonCompatible = match[1]
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
    .replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(jsonCompatible) as T;
}

test("skill profile policy covers every technology and only registered scoring scenarios", async () => {
  const [policySource, technologySource, scoringSource] = await Promise.all([
    readFile(policyUrl, "utf8"),
    readFile(technologyCatalogUrl, "utf8"),
    readFile(scoringCatalogUrl, "utf8"),
  ]);
  const policy = JSON.parse(policySource) as SkillPolicy;
  const technologyCatalog = JSON.parse(technologySource) as {
    technologies: Array<{ id: string }>;
  };
  const scoringCatalog = JSON.parse(scoringSource) as {
    scenarios: Array<{ id: string }>;
  };

  assert.equal(policy.schemaVersion, 1);
  assert.deepEqual(
    policy.levels.map((level) => level.id),
    ["novice", "advanced_beginner", "practitioner", "proficient"],
  );
  assert.equal(policy.levels[0]?.minPoints, 0);
  for (let index = 1; index < policy.levels.length; index += 1) {
    assert.ok(
      (policy.levels[index]?.minPoints ?? 0) > (policy.levels[index - 1]?.minPoints ?? 0),
      "skill thresholds must be strictly increasing",
    );
  }
  assert.equal(
    policy.levels.find((level) => level.id === "practitioner")?.requiresEligibleChallenge,
    true,
  );
  assert.equal(
    policy.levels.find((level) => level.id === "proficient")?.requiresEligibleChallenge,
    true,
  );

  const expectedTechnologyIds = technologyCatalog.technologies.map(({ id }) => id).sort();
  const configuredTechnologyIds = policy.technologies.map(({ technologyId }) => technologyId).sort();
  assert.deepEqual(configuredTechnologyIds, expectedTechnologyIds);

  const scoringIds = new Set(scoringCatalog.scenarios.map(({ id }) => id));
  const assignedScenarioIds = new Set<string>();
  for (const technology of policy.technologies) {
    for (const scenarioId of technology.scenarioIds) {
      assert.ok(scoringIds.has(scenarioId), `${scenarioId} must be registered for server scoring`);
      assert.ok(!assignedScenarioIds.has(scenarioId), `${scenarioId} is assigned to multiple technologies`);
      assignedScenarioIds.add(scenarioId);
    }
  }

  for (const workflowId of [
    "developer-workflow-basics.explore",
    "git-basics",
    "developer-workflow-basics.challenge",
    "html-page-workflow.explore",
    "html-page-workflow.guided",
    "html-page-workflow.challenge",
    "research-workflow.explore",
    "research-workflow.guided",
    "research-workflow.challenge",
  ]) {
    assert.ok(
      !assignedScenarioIds.has(workflowId),
      `${workflowId} is a multi-technology workflow and must not be attributed to one technology`,
    );
  }
});

test("server calculator mirrors the declarative level and scenario policy exactly", async () => {
  const [policySource, calculatorSource] = await Promise.all([
    readFile(policyUrl, "utf8"),
    readFile(calculatorUrl, "utf8"),
  ]);
  const policy = JSON.parse(policySource) as SkillPolicy;
  const resolverLevels = parseJavascriptLiteral<LevelPolicy[]>(
    calculatorSource,
    /const LEVEL_THRESHOLDS = (\[[\s\S]*?\]);/,
    "LEVEL_THRESHOLDS",
  );
  const resolverTechnologyMap = parseJavascriptLiteral<Record<string, string[]>>(
    calculatorSource,
    /const TECHNOLOGY_SCENARIOS = (\{[\s\S]*?\});/,
    "TECHNOLOGY_SCENARIOS",
  );

  assert.deepEqual(resolverLevels, policy.levels);
  assert.deepEqual(
    Object.entries(resolverTechnologyMap)
      .map(([technologyId, scenarioIds]) => ({ technologyId, scenarioIds }))
      .sort((left, right) => left.technologyId.localeCompare(right.technologyId)),
    [...policy.technologies].sort((left, right) =>
      left.technologyId.localeCompare(right.technologyId),
    ),
  );
});
