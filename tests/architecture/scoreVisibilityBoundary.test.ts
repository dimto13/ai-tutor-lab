import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataResourceUrl = new URL("../../amplify/data/resource.ts", import.meta.url);
const policyLoadUrl = new URL(
  "../../amplify/data/score-visibility-load-policy.js",
  import.meta.url,
);
const policySaveUrl = new URL(
  "../../amplify/data/save-tenant-score-visibility-policy.js",
  import.meta.url,
);
const scoreboardUrl = new URL("../../amplify/data/load-tenant-scoreboard.js", import.meta.url);

function definitionBlock(source: string, name: string): string {
  const start = source.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `${name} must exist in Amplify Data schema`);
  const remainder = source.slice(start + name.length + 3);
  const nextDefinition = remainder.search(/\n {2}[A-Za-z][A-Za-z0-9]*:/);
  const end =
    nextDefinition >= 0 ? start + name.length + 3 + nextDefinition : source.indexOf("\n});", start);
  return source.slice(start, end >= 0 ? end : source.length);
}

test("score visibility policy is server-owned and defaults missing tenants to private", async () => {
  const [resourceSource, loadSource] = await Promise.all([
    readFile(dataResourceUrl, "utf8"),
    readFile(policyLoadUrl, "utf8"),
  ]);
  const modelBlock = definitionBlock(resourceSource, "TenantScoreVisibilityPolicy");

  assert.match(modelBlock, /visibility:\s*a\.ref\(["']ScoreVisibilityLevel["']\)\.required\(\)/);
  assert.match(modelBlock, /leaderboardsEnabled:\s*a\.boolean\(\)\.required\(\)/);
  assert.match(
    modelBlock,
    /\.disableOperations\(\s*\[\s*"queries"\s*,\s*"mutations"\s*,\s*"subscriptions"\s*\]\s*\)/,
  );
  assert.match(loadSource, /if \(!row\)/);
  assert.match(loadSource, /visibility:\s*["']private["']/);
  assert.match(loadSource, /leaderboardsEnabled:\s*false/);
  assert.doesNotMatch(loadSource, /personal:\$\{identity\.sub\}/);
});

test("score reporting fails closed on missing, conflicting or cross-tenant context", async () => {
  const [loadSource, scoreboardSource] = await Promise.all([
    readFile(policyLoadUrl, "utf8"),
    readFile(scoreboardUrl, "utf8"),
  ]);

  assert.match(loadSource, /Tenant membership is required for score reporting/);
  assert.match(loadSource, /Multiple tenant memberships require explicit tenant selection/);
  assert.match(loadSource, /Unknown application role membership/);
  assert.match(loadSource, /row\.tenantId !== tenantId/);
  assert.match(loadSource, /Score visibility policy escaped authenticated tenant scope/);

  assert.match(scoreboardSource, /index:\s*["']scoreEventsByTenantTime["']/);
  assert.match(scoreboardSource, /tenantId = :tenantId/);
  assert.match(scoreboardSource, /item\.tenantId !== subject\.tenantId/);
  assert.match(scoreboardSource, /Score query escaped authenticated tenant scope/);
  assert.doesNotMatch(scoreboardSource, /operation:\s*["']Scan["']/);
  assert.doesNotMatch(scoreboardSource, /ctx\.args\.tenantId/);
  assert.doesNotMatch(scoreboardSource, /ctx\.args\.userId/);
});

test("aggregate score reporting suppresses cohorts below five and admits exactly five", async () => {
  const source = await readFile(scoreboardUrl, "utf8");

  assert.match(source, /const MIN_AGGREGATE_SCORE_COHORT = 5/);
  assert.match(source, /cohortSize < MIN_AGGREGATE_SCORE_COHORT/);
  assert.match(source, /return emptyResult\(policy, true\)/);
  assert.match(source, /visibility:\s*["']aggregate["']/);
  assert.match(source, /cohortSize,/);
  assert.match(source, /totalPoints:\s*roundPoints\(totalPoints\)/);
  assert.match(source, /entries:\s*\[\]/);
  assert.doesNotMatch(source, /cohortSize <= MIN_AGGREGATE_SCORE_COHORT/);
});

test("named visibility requires persisted approval and remains tenant-admin only", async () => {
  const [resourceSource, loadSource, saveSource, scoreboardSource] = await Promise.all([
    readFile(dataResourceUrl, "utf8"),
    readFile(policyLoadUrl, "utf8"),
    readFile(policySaveUrl, "utf8"),
    readFile(scoreboardUrl, "utf8"),
  ]);
  const saveBlock = definitionBlock(resourceSource, "saveTenantScoreVisibilityPolicy");

  assert.match(saveBlock, /allow\.groups\(\["role:tenant_admin"\]\)/);
  assert.doesNotMatch(saveBlock, /allow\.authenticated\(\)/);
  assert.match(saveSource, /ctx\.args\.namedApprovalConfirmed === true/);
  assert.match(saveSource, /Named score visibility requires explicit documented approval/);
  assert.match(saveSource, /namedApprovalConfirmedBy = subject\.userId/);
  assert.match(saveSource, /namedApprovalConfirmedAt = util\.time\.nowEpochMilliSeconds\(\)/);
  assert.match(loadSource, /Named score visibility is missing documented approval/);
  assert.match(scoreboardSource, /policy\.namedApprovalConfirmed !== true/);
  assert.match(scoreboardSource, /subject\.role !== ["']tenant_admin["']/);
  assert.match(scoreboardSource, /util\.unauthorized\(\)/);
});

test("score visibility mutation cannot be scoped or approved by an untrusted client identity", async () => {
  const [resourceSource, saveSource] = await Promise.all([
    readFile(dataResourceUrl, "utf8"),
    readFile(policySaveUrl, "utf8"),
  ]);
  const saveBlock = definitionBlock(resourceSource, "saveTenantScoreVisibilityPolicy");
  const argumentStart = saveBlock.indexOf(".arguments({");
  const returnStart = saveBlock.indexOf(".returns(");
  assert.ok(argumentStart >= 0 && returnStart > argumentStart);
  const argumentsBlock = saveBlock.slice(argumentStart, returnStart);

  assert.doesNotMatch(argumentsBlock, /\btenantId\s*:/);
  assert.doesNotMatch(argumentsBlock, /\buserId\s*:/);
  assert.doesNotMatch(argumentsBlock, /\bnamedApprovalConfirmedBy\s*:/);
  assert.doesNotMatch(argumentsBlock, /\bnamedApprovalConfirmedAt\s*:/);
  assert.match(saveSource, /if \(!tenantAdmin\) util\.unauthorized\(\)/);
  assert.match(saveSource, /Tenant membership is required for score policy administration/);
  assert.match(saveSource, /tenantId:\s*subject\.tenantId/);
  assert.doesNotMatch(saveSource, /ctx\.args\.tenantId/);
  assert.doesNotMatch(saveSource, /ctx\.args\.userId/);
  assert.doesNotMatch(saveSource, /ctx\.args\.namedApprovalConfirmedBy/);
  assert.doesNotMatch(saveSource, /ctx\.args\.namedApprovalConfirmedAt/);
});
