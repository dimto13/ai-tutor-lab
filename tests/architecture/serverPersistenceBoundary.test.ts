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

const clientOperations = [
  "loadTrainingState",
  "saveTrainingState",
  "loadRuntimeSnapshot",
  "saveRuntimeSnapshot",
  "deleteRuntimeSnapshot",
  "loadUserPreferences",
  "saveUserPreferences",
] as const;

const schemaMembers = [
  "TrainingMode",
  "StepStatus",
  "AttemptOutcome",
  ...serverOwnedModels,
  "TrainingStateEnvelope",
  "RuntimeSnapshotEnvelope",
  "UserPreferencesEnvelope",
  ...clientOperations,
] as const;

function definitionBlock(source: string, name: string): string {
  const start = source.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `${name} must exist in Amplify Data schema`);

  const currentIndex = schemaMembers.indexOf(name as (typeof schemaMembers)[number]);
  const laterStarts = schemaMembers
    .slice(currentIndex + 1)
    .map((candidate) => source.indexOf(`  ${candidate}:`, start + name.length + 3))
    .filter((position) => position > start);
  const end = laterStarts.length > 0 ? Math.min(...laterStarts) : source.indexOf("\n});", start);
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
      /\.disableOperations\(\["queries", "mutations", "subscriptions"\]\)/,
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

    assert.match(block, /allow\.authenticated\(\)/, `${operation} must require authentication`);
    assert.match(block, /a\.handler\.custom\(/, `${operation} must use a server resolver`);
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

test("user preferences persist independently from training sessions", async () => {
  const source = await readFile(dataResourceUrl, "utf8");
  for (const operation of ["loadUserPreferences", "saveUserPreferences"]) {
    const block = definitionBlock(source, operation);
    assert.match(block, /dataSource:\s*a\.ref\(["']UserPreferences["']\)/);
    assert.doesNotMatch(block, /dataSource:\s*a\.ref\(["']TrainingSession["']\)/);
    assert.doesNotMatch(block, /scenarioId\s*:/);
  }
});

test("score and credential models have no client mutation handler in the persistence slice", async () => {
  const source = await readFile(dataResourceUrl, "utf8");
  for (const model of ["ScoreEvent", "SkillProfile", "Attestation"]) {
    assert.doesNotMatch(
      source,
      new RegExp(`dataSource:\\s*a\\.ref\\(["']${model}["']\\)`),
      `${model} must remain server-owned until its authoritative service is implemented`,
    );
  }
});

test("Amplify backend composes Data next to Auth", async () => {
  const source = await readFile(backendUrl, "utf8");
  assert.match(source, /import\s+\{\s*data\s*\}\s+from\s+["']\.\/data\/resource["']/);
  assert.match(source, /defineBackend\(\{[\s\S]*auth,[\s\S]*data,[\s\S]*\}\)/);
});
