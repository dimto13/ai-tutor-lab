import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataResourceUrl = new URL("../../amplify/data/resource.ts", import.meta.url);
const loadScoresUrl = new URL(
  "../../amplify/data/skill-profile-load-score-events.js",
  import.meta.url,
);
const loadRunsUrl = new URL("../../amplify/data/skill-profile-load-runs.js", import.meta.url);
const calculateUrl = new URL("../../amplify/data/skill-profile-calculate.js", import.meta.url);
const appServiceUrl = new URL(
  "../../apps/web/src/skill-profile/applicationSkillProfileService.ts",
  import.meta.url,
);
const adapterUrl = new URL(
  "../../apps/web/src/skill-profile/adapters/amplifySkillProfileService.ts",
  import.meta.url,
);
const matrixUrl = new URL(
  "../../apps/web/src/components/dashboard/CompetencyMatrix.tsx",
  import.meta.url,
);

function schemaMemberBlock(source: string, memberName: string): string {
  const startMarker = `  ${memberName}:`;
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing schema marker ${startMarker}`);
  const schemaEnd = source.indexOf("\n});", start + startMarker.length);
  assert.notEqual(schemaEnd, -1, "Missing Amplify schema terminator");
  return source.slice(start, schemaEnd);
}

test("SkillProfile cannot be directly mutated and is exposed as an owner-derived query", async () => {
  const source = await readFile(dataResourceUrl, "utf8");
  const modelBlock = schemaMemberBlock(source, "SkillProfile");
  const queryBlock = schemaMemberBlock(source, "listMySkillProfiles");

  assert.match(
    modelBlock,
    /disableOperations\(\[["']queries["'], ["']mutations["'], ["']subscriptions["']\]\)/,
  );
  assert.match(modelBlock, /level:\s*a\.ref\(["']SkillLevel["']\)\.required\(\)/);
  assert.match(modelBlock, /eligibleChallengeCount:\s*a\.integer\(\)\.required\(\)/);

  assert.match(queryBlock, /dataSource:\s*a\.ref\(["']ScoreEvent["']\)/);
  assert.match(queryBlock, /skill-profile-load-score-events\.js/);
  assert.match(queryBlock, /dataSource:\s*a\.ref\(["']ScenarioRun["']\)/);
  assert.match(queryBlock, /skill-profile-load-runs\.js/);
  assert.match(queryBlock, /skill-profile-calculate\.js/);
  assert.doesNotMatch(queryBlock, /dataSource:\s*a\.ref\(["']SkillProfile["']\)/);
});

test("skill evidence loaders use authenticated owner indexes, never scan and reject truncation", async () => {
  const [scoreSource, runSource] = await Promise.all([
    readFile(loadScoresUrl, "utf8"),
    readFile(loadRunsUrl, "utf8"),
  ]);

  assert.match(scoreSource, /identity\.sub/);
  assert.match(scoreSource, /personal:\$\{identity\.sub\}/);
  assert.match(scoreSource, /index:\s*["']scoreEventsByOwnerTime["']/);
  assert.match(scoreSource, /ctx\.result\.nextToken/);
  assert.match(scoreSource, /SkillProfileEvidenceWindowError/);
  assert.doesNotMatch(scoreSource, /operation:\s*["']Scan["']/);

  assert.match(runSource, /index:\s*["']scenarioRunsByOwnerTime["']/);
  assert.match(runSource, /ctx\.stash\.skillSubject/);
  assert.match(runSource, /ctx\.result\.nextToken/);
  assert.match(runSource, /SkillProfileEvidenceWindowError/);
  assert.doesNotMatch(runSource, /operation:\s*["']Scan["']/);
});

test("competence projection requires eligible run evidence for points and challenge gates", async () => {
  const source = await readFile(calculateUrl, "utf8");

  assert.match(source, /run\.evidenceEligible === true/);
  assert.match(source, /eligibleScenarioVersionKeys\[evidenceKey\] = true/);
  assert.match(source, /run\.mode === ["']challenge["']/);
  assert.match(source, /eligibleScenarioVersionKeys\[evidenceKey\] === true/);
  assert.match(source, /pointsByTechnology\[technologyId\] \+= event\.pointsDelta/);
  assert.match(source, /eligibleChallengeCount >= 1/);
  assert.doesNotMatch(source, /selfAssessedAiLevel/);
  assert.doesNotMatch(source, /UserPreferences/);
  assert.doesNotMatch(source, /provider/i);
  assert.doesNotMatch(source, /anthropic/i);
  assert.doesNotMatch(source, /openai/i);
});

test("web consumes server SkillProfiles and does not calculate competence locally", async () => {
  const [appSource, adapterSource, matrixSource] = await Promise.all([
    readFile(appServiceUrl, "utf8"),
    readFile(adapterUrl, "utf8"),
    readFile(matrixUrl, "utf8"),
  ]);

  assert.match(appSource, /createAmplifySkillProfileService/);
  assert.match(appSource, /configuredMode\(\) === ["']remote["']/);
  assert.match(adapterSource, /client\.queries\.listMySkillProfiles\(\)/);
  assert.doesNotMatch(adapterSource, /minPoints/);
  assert.doesNotMatch(adapterSource, /requiresEligibleChallenge/);
  assert.match(matrixSource, /profile\.points/);
  assert.match(matrixSource, /profile\.level/);
  assert.match(matrixSource, /profile\.eligibleChallengeCount/);
  assert.doesNotMatch(matrixSource, /minPoints/);
  assert.doesNotMatch(matrixSource, /resolveSkillLevel/);
});
