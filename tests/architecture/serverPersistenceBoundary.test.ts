import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataResourceUrl = new URL("../../amplify/data/resource.ts", import.meta.url);
const backendUrl = new URL("../../amplify/backend.ts", import.meta.url);
const resolverUrls = [
  "load-training-state.js",
  "save-training-state.js",
  "load-runtime-snapshot.js",
  "save-runtime-snapshot.js",
  "delete-runtime-snapshot.js",
  "load-user-profile.js",
  "save-user-profile.js",
  "load-user-preferences.js",
  "save-user-preferences.js",
].map((file) => new URL(`../../amplify/data/${file}`, import.meta.url));

const serverOwnedModels = [
  "UserProfile",
  "UserPreferences",
  "TrainingSession",
  "StepState",
  "RuntimeSnapshot",
  "HintUsage",
  "Attempt",
  "ScoreEvent",
  "SkillProfile",
  "Attestation",
] as const;

const clientOperationDataSources = {
  loadTrainingState: "TrainingSession",
  saveTrainingState: "TrainingSession",
  loadRuntimeSnapshot: "RuntimeSnapshot",
  saveRuntimeSnapshot: "RuntimeSnapshot",
  deleteRuntimeSnapshot: "RuntimeSnapshot",
  loadUserProfile: "UserProfile",
  saveUserProfile: "UserProfile",
  loadUserPreferences: "UserPreferences",
  saveUserPreferences: "UserPreferences",
} as const;

const clientOperations = Object.keys(clientOperationDataSources) as Array<
  keyof typeof clientOperationDataSources
>;

const disabledGeneratedOperationsPattern =
  /\.disableOperations\(\s*\[\s*["']queries["']\s*,\s*["']mutations["']\s*,\s*["']subscriptions["']\s*,?\s*\]\s*\)/;

function definitionBlock(source: string, name: string): string {
  const start = source.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `${name} must exist in Amplify Data schema`);
  const remainder = source.slice(start + name.length + 3);
  const nextDefinition = remainder.search(/\n {2}[A-Za-z][A-Za-z0-9]*:/);
  const end =
    nextDefinition >= 0 ? start + name.length + 3 + nextDefinition : source.indexOf("\n});", start);
  return source.slice(start, end >= 0 ? end : source.length);
}

test("all durable user data models carry explicit ownership and expose no generated CRUD", async () => {
  const source = await readFile(dataResourceUrl, "utf8");

  for (const model of serverOwnedModels) {
    const block = definitionBlock(source, model);
    assert.match(block, /tenantId:\s*a\.string\(\)\.required\(\)/, `${model} needs tenantId`);
    assert.match(block, /userId:\s*a\.string\(\)\.required\(\)/, `${model} needs userId`);
    assert.match(
      block,
      disabledGeneratedOperationsPattern,
      `${model} must disable generated browser CRUD and subscriptions`,
    );
    assert.match(block, /allow\.authenticated\(\)/, `${model} needs an explicit Amplify auth rule`);
  }
});

test("client persistence operations never accept authoritative owner fields", async () => {
  const source = await readFile(dataResourceUrl, "utf8");

  for (const operation of clientOperations) {
    const block = definitionBlock(source, operation);
    const argumentStart = block.indexOf(".arguments({");
    const returnStart = block.indexOf(".returns(");
    assert.ok(returnStart >= 0, `${operation} must define a return type`);

    if (argumentStart >= 0) {
      assert.ok(returnStart > argumentStart, `${operation} arguments must precede its return type`);
      const argumentsBlock = block.slice(argumentStart, returnStart);
      assert.doesNotMatch(
        argumentsBlock,
        /\buserId\s*:/,
        `${operation} must derive userId server-side`,
      );
      assert.doesNotMatch(
        argumentsBlock,
        /\btenantId\s*:/,
        `${operation} must derive tenantId server-side`,
      );
    }

    const dataSource = clientOperationDataSources[operation];
    assert.match(block, /allow\.authenticated\(\)/, `${operation} must require authentication`);
    assert.match(block, /a\.handler\.custom\(/, `${operation} must use a server resolver`);
    assert.match(
      block,
      new RegExp(`dataSource:\\s*a\\.ref\\(["']${dataSource}["']\\)`),
      `${operation} must retain its server-side ${dataSource} data source`,
    );
  }
});

test("AppSync persistence resolvers derive subject identity from Cognito context", async () => {
  const sources = await Promise.all(resolverUrls.map((url) => readFile(url, "utf8")));

  for (const source of sources) {
    assert.match(source, /identity\.sub/);
    assert.match(source, /tenant:/);
    assert.doesNotMatch(source, /ctx\.args\.userId/);
    assert.doesNotMatch(source, /ctx\.args\.tenantId/);
  }
});

test("user profile and preferences persist independently from training sessions", async () => {
  const source = await readFile(dataResourceUrl, "utf8");
  for (const operation of [
    "loadUserProfile",
    "saveUserProfile",
    "loadUserPreferences",
    "saveUserPreferences",
  ]) {
    const block = definitionBlock(source, operation);
    assert.doesNotMatch(block, /dataSource:\s*a\.ref\(["']TrainingSession["']\)/);
    assert.doesNotMatch(block, /scenarioId\s*:/);
  }

  for (const operation of ["loadUserProfile", "saveUserProfile"]) {
    const block = definitionBlock(source, operation);
    assert.match(block, /dataSource:\s*a\.ref\(["']UserProfile["']\)/);
  }

  for (const operation of ["loadUserPreferences", "saveUserPreferences"]) {
    const block = definitionBlock(source, operation);
    assert.match(block, /dataSource:\s*a\.ref\(["']UserPreferences["']\)/);
  }
});

test("self-assessed AI level is a user preference and not a measured skill field", async () => {
  const source = await readFile(dataResourceUrl, "utf8");
  const enumBlock = definitionBlock(source, "SelfAssessedAiLevel");
  const preferencesBlock = definitionBlock(source, "UserPreferences");
  const envelopeBlock = definitionBlock(source, "UserPreferencesEnvelope");
  const saveBlock = definitionBlock(source, "saveUserPreferences");
  const skillBlock = definitionBlock(source, "SkillProfile");

  assert.match(enumBlock, /beginner/);
  assert.match(enumBlock, /intermediate/);
  assert.match(enumBlock, /advanced/);
  assert.match(preferencesBlock, /selfAssessedAiLevel:\s*a\.ref\(["']SelfAssessedAiLevel["']\)/);
  assert.match(envelopeBlock, /selfAssessedAiLevel:\s*a\.ref\(["']SelfAssessedAiLevel["']\)/);
  assert.match(saveBlock, /selfAssessedAiLevel:\s*a\.ref\(["']SelfAssessedAiLevel["']\)/);
  assert.doesNotMatch(skillBlock, /selfAssessedAiLevel/);
});

test("SkillProfile remains unavailable as a direct browser data source", async () => {
  const source = await readFile(dataResourceUrl, "utf8");
  assert.doesNotMatch(
    source,
    /dataSource:\s*a\.ref\(["']SkillProfile["']\)/,
    "SkillProfile must remain a server-calculated projection rather than direct browser CRUD",
  );
});

test("Amplify backend composes Data next to Auth", async () => {
  const source = await readFile(backendUrl, "utf8");
  assert.match(source, /import\s+\{\s*data\s*\}\s+from\s+["']\.\/data\/resource["']/);
  assert.match(source, /defineBackend\(\{[\s\S]*auth,[\s\S]*data,[\s\S]*\}\)/);
});
