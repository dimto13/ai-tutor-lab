import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataResourceUrl = new URL("../../amplify/data/resource.ts", import.meta.url);
const loadResolverUrl = new URL("../../amplify/data/award-score-load-session.js", import.meta.url);
const runResolverUrl = new URL(
  "../../amplify/data/award-score-write-run.generated.js",
  import.meta.url,
);
const writeResolverUrl = new URL(
  "../../amplify/data/award-score-write-event.generated.js",
  import.meta.url,
);
const listRunResolverUrl = new URL("../../amplify/data/list-scenario-runs.js", import.meta.url);
const listResolverUrl = new URL("../../amplify/data/list-score-events.js", import.meta.url);
const completionScreenUrl = new URL(
  "../../apps/web/src/components/training/CompletionScreen.tsx",
  import.meta.url,
);
const scoreAdapterUrl = new URL(
  "../../apps/web/src/scoring/adapters/amplifyScenarioScoreService.ts",
  import.meta.url,
);

function blockBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing schema marker ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing schema marker ${endMarker}`);
  return source.slice(start, end);
}

function schemaMemberBlock(source: string, memberName: string): string {
  const startMarker = `  ${memberName}:`;
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing schema marker ${startMarker}`);
  const remainder = source.slice(start + startMarker.length);
  const nextDefinition = remainder.search(/\n {2}[A-Za-z][A-Za-z0-9]*:/);
  const schemaEnd = source.indexOf("\n});", start + startMarker.length);
  assert.notEqual(schemaEnd, -1, "Missing Amplify schema terminator");
  const end = nextDefinition >= 0 ? start + startMarker.length + nextDefinition : schemaEnd;
  return source.slice(start, end);
}

test("public score award input cannot set owner, version, points or anti-gaming evidence", async () => {
  const source = await readFile(dataResourceUrl, "utf8");
  const awardBlock = schemaMemberBlock(source, "awardScenarioScore");
  const argumentStart = awardBlock.indexOf(".arguments({");
  const returnStart = awardBlock.indexOf(".returns(");
  assert.ok(argumentStart >= 0 && returnStart > argumentStart);
  const argumentsBlock = awardBlock.slice(argumentStart, returnStart);

  assert.match(argumentsBlock, /scenarioId:\s*a\.string\(\)\.required\(\)/);
  assert.match(argumentsBlock, /mode:\s*a\.ref\(["']TrainingMode["']\)\.required\(\)/);
  assert.doesNotMatch(argumentsBlock, /\bpoints\s*:/);
  assert.doesNotMatch(argumentsBlock, /\bscenarioVersion\s*:/);
  assert.doesNotMatch(argumentsBlock, /\buserId\s*:/);
  assert.doesNotMatch(argumentsBlock, /\btenantId\s*:/);
  assert.doesNotMatch(argumentsBlock, /estimatedMinutes/);
  assert.doesNotMatch(argumentsBlock, /fastRunThreshold/);
  assert.doesNotMatch(argumentsBlock, /evidenceStatus/);
  assert.match(awardBlock, /award-score-load-session\.js/);
  assert.match(awardBlock, /award-score-write-run\.generated\.js/);
  assert.match(awardBlock, /award-score-write-event\.generated\.js/);
});

test("server persists every completed run before awarding scenario-version points once", async () => {
  const [resourceSource, loadSource, runSource, writeSource] = await Promise.all([
    readFile(dataResourceUrl, "utf8"),
    readFile(loadResolverUrl, "utf8"),
    readFile(runResolverUrl, "utf8"),
    readFile(writeResolverUrl, "utf8"),
  ]);

  const awardBlock = schemaMemberBlock(resourceSource, "awardScenarioScore");
  assert.ok(
    awardBlock.indexOf("award-score-load-session.js") <
      awardBlock.indexOf("award-score-write-run.generated.js"),
  );
  assert.ok(
    awardBlock.indexOf("award-score-write-run.generated.js") <
      awardBlock.indexOf("award-score-write-event.generated.js"),
  );
  assert.match(awardBlock, /dataSource:\s*a\.ref\(["']ScenarioRun["']\)/);

  assert.match(loadSource, /identity\.sub/);
  assert.match(loadSource, /personal:\$\{identity\.sub\}/);
  assert.match(loadSource, /operation:\s*["']GetItem["']/);
  assert.match(loadSource, /consistentRead:\s*true/);
  assert.match(loadSource, /payload\.finishedAt/);
  assert.match(loadSource, /payload\.challengeOutcome\s*!==\s*["']passed["']/);

  assert.match(runSource, /payload\.startedAt/);
  assert.match(runSource, /payload\.finishedAt/);
  assert.match(runSource, /definition\.estimatedMinutes\s*\*\s*60_000/);
  assert.match(runSource, /definition\.fastRunThresholdRatio/);
  assert.match(runSource, /durationMs\s*<\s*fastRunThresholdMs/);
  assert.match(runSource, /["']suspect_fast["']/);
  assert.match(runSource, /evidenceEligible:\s*!suspectFast/);
  assert.match(runSource, /sourceRevision:\s*session\.revision/);
  assert.match(runSource, /attribute_not_exists\(id\)/);
  assert.match(runSource, /startedAt/);
  assert.match(runSource, /finishedAt/);
  assert.match(runSource, /sourceRevision/);
  assert.doesNotMatch(runSource, /ctx\.args\.estimatedMinutes/);
  assert.doesNotMatch(runSource, /ctx\.args\.fastRunThreshold/);
  assert.doesNotMatch(runSource, /ctx\.args\.evidenceStatus/);

  assert.match(writeSource, /const SCORE_BASE_PERCENT = 70/);
  assert.match(writeSource, /const SCORE_BONUS_PERCENT = 30/);
  assert.match(writeSource, /explore:\s*0\.5/);
  assert.match(writeSource, /guided:\s*1/);
  assert.match(writeSource, /challenge:\s*2/);
  assert.match(writeSource, /1:\s*10/);
  assert.match(writeSource, /2:\s*25/);
  assert.match(writeSource, /3:\s*50/);
  assert.match(writeSource, /attribute_not_exists\(id\)/);
  assert.match(writeSource, /equalsIgnore/);
  assert.match(writeSource, /scenarioVersion:\s*definition\.version/);
  assert.match(writeSource, /pointsDelta:\s*breakdown\.awardedPoints/);
  assert.doesNotMatch(writeSource, /ctx\.args\.points/);
  assert.doesNotMatch(writeSource, /ctx\.args\.scenarioVersion/);
});

test("score and run ledger reads remain scoped to authenticated owner indexes", async () => {
  const [resourceSource, listRunSource, listSource] = await Promise.all([
    readFile(dataResourceUrl, "utf8"),
    readFile(listRunResolverUrl, "utf8"),
    readFile(listResolverUrl, "utf8"),
  ]);

  assert.match(resourceSource, /name\(["']scoreEventsByOwnerTime["']\)/);
  assert.match(resourceSource, /name\(["']scenarioRunsByOwnerTime["']\)/);

  assert.match(listRunSource, /identity\.sub/);
  assert.match(listRunSource, /index:\s*["']scenarioRunsByOwnerTime["']/);
  assert.match(listRunSource, /scanIndexForward:\s*false/);
  assert.doesNotMatch(listRunSource, /operation:\s*["']Scan["']/);

  assert.match(listSource, /identity\.sub/);
  assert.match(listSource, /index:\s*["']scoreEventsByOwnerTime["']/);
  assert.match(listSource, /scanIndexForward:\s*false/);
  assert.doesNotMatch(listSource, /operation:\s*["']Scan["']/);
});

test("completion UI consumes server result and explains point-free repeat runs", async () => {
  const [completionSource, adapterSource] = await Promise.all([
    readFile(completionScreenUrl, "utf8"),
    readFile(scoreAdapterUrl, "utf8"),
  ]);

  assert.match(completionSource, /useScenarioScoreAward/);
  assert.match(completionSource, /score\.result\.event\.points/);
  assert.doesNotMatch(completionSource, /earnedPoints/);
  assert.doesNotMatch(completionSource, /scenario\.points/);
  assert.match(completionSource, /keine lokalen Ersatzpunkte/);
  assert.match(completionSource, /bereits gewertet/);
  assert.match(completionSource, /keine weiteren Punkte/);

  const mutationCall = blockBetween(adapterSource, "client.mutations.awardScenarioScore({", "});");
  assert.match(mutationCall, /scenarioId:\s*request\.scenarioId/);
  assert.match(mutationCall, /mode:\s*request\.mode/);
  assert.doesNotMatch(mutationCall, /points/);
  assert.doesNotMatch(mutationCall, /scenarioVersion/);
  assert.doesNotMatch(mutationCall, /userId/);
  assert.doesNotMatch(mutationCall, /tenantId/);
  assert.doesNotMatch(mutationCall, /estimatedMinutes/);
  assert.doesNotMatch(mutationCall, /evidenceStatus/);
});
