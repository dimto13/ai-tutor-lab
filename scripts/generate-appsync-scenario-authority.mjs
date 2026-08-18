import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format as formatCode, resolveConfig } from "prettier";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scoringCatalogPath = resolve(root, "content/scoring/scenario-score-catalog.json");
const scenariosDir = resolve(root, "content/scenarios");
const prettierConfig = (await resolveConfig(resolve(root, "amplify/data/resource.ts"))) ?? {};

const outputs = [
  {
    template: "amplify/data/award-score-write-event.js",
    output: "amplify/data/award-score-write-event.generated.js",
    constant: "SCENARIO_SCORE_DEFINITIONS",
    projection: (definition) => ({
      mode: definition.mode,
      version: definition.version,
      points: definition.points,
      estimatedMinutes: definition.estimatedMinutes,
      fastRunThresholdRatio: definition.fastRunThresholdRatio,
    }),
  },
  {
    template: "amplify/data/award-score-write-run.js",
    output: "amplify/data/award-score-write-run.generated.js",
    constant: "SCENARIO_RUN_DEFINITIONS",
    projection: (definition) => ({
      mode: definition.mode,
      version: definition.version,
      estimatedMinutes: definition.estimatedMinutes,
      fastRunThresholdRatio: definition.fastRunThresholdRatio,
    }),
  },
  {
    template: "amplify/data/issue-attestation-load-session.js",
    output: "amplify/data/issue-attestation-load-session.generated.js",
    constant: "ATTESTATION_DEFINITIONS",
    projection: (definition) => ({
      mode: definition.mode,
      scenarioVersion: definition.version,
      productId: definition.productId,
      productVersion: definition.productVersion,
      learningObjectiveIds: definition.learningObjectiveIds,
    }),
    attestableOnly: true,
  },
];

function objectValue(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value;
}

function nonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value;
}

function positiveNumber(value, fieldName) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }
  return value;
}

function ratio(value, fieldName) {
  if (value === null) return null;
  const parsed = positiveNumber(value, fieldName);
  if (parsed > 1) throw new Error(`${fieldName} must be <= 1`);
  return parsed;
}

function stringArray(value, fieldName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${fieldName} must contain at least one id`);
  }
  const seen = new Set();
  const values = value.map((item, index) => nonEmptyString(item, `${fieldName}[${index}]`));
  for (const item of values) {
    if (seen.has(item)) throw new Error(`${fieldName} contains duplicate ${item}`);
    seen.add(item);
  }
  return values.sort((left, right) => left.localeCompare(right));
}

async function loadScenarios() {
  const files = (await readdir(scenariosDir)).filter((name) => name.endsWith(".json")).sort();
  const scenarios = new Map();
  for (const file of files) {
    const source = JSON.parse(await readFile(resolve(scenariosDir, file), "utf8"));
    const scenario = objectValue(source, `scenario ${file}`);
    const id = nonEmptyString(scenario.id, `${file}.id`);
    if (scenarios.has(id)) throw new Error(`Duplicate scenario id ${id}`);
    scenarios.set(id, scenario);
  }
  return scenarios;
}

async function authoritativeDefinitions() {
  const catalogSource = objectValue(
    JSON.parse(await readFile(scoringCatalogPath, "utf8")),
    "scoring catalog",
  );
  if (catalogSource.schemaVersion !== 2)
    throw new Error("Unsupported scoring catalog schemaVersion");
  if (!Array.isArray(catalogSource.scenarios))
    throw new Error("Scoring catalog scenarios must be an array");

  const scenarios = await loadScenarios();
  const definitions = [];
  const seen = new Set();
  for (const [index, rawDefinition] of catalogSource.scenarios.entries()) {
    const definition = objectValue(rawDefinition, `scoring scenario ${index}`);
    const id = nonEmptyString(definition.id, `scoring scenario ${index}.id`);
    if (seen.has(id)) throw new Error(`Duplicate scoring definition ${id}`);
    seen.add(id);

    const mode = nonEmptyString(definition.mode, `${id}.mode`);
    if (mode !== "explore" && mode !== "guided" && mode !== "challenge") {
      throw new Error(`${id}.mode is unsupported`);
    }
    const points = positiveNumber(definition.points, `${id}.points`);
    const estimatedMinutes = positiveNumber(definition.estimatedMinutes, `${id}.estimatedMinutes`);
    const scenario = scenarios.get(id);

    let productId = null;
    let productVersion = null;
    let learningObjectiveIds = [];
    let attestable = false;
    if (scenario) {
      if (scenario.mode !== mode)
        throw new Error(`${id} scoring mode differs from scenario content`);
      if (scenario.points !== points)
        throw new Error(`${id} scoring points differ from scenario content`);
      if (scenario.estimatedMinutes !== estimatedMinutes) {
        throw new Error(`${id} estimatedMinutes differs from scenario content`);
      }
      if (mode === "challenge") {
        const environment = objectValue(scenario.environment, `${id}.environment`);
        productId = nonEmptyString(environment.productId, `${id}.environment.productId`);
        productVersion = nonEmptyString(environment.version, `${id}.environment.version`);
        learningObjectiveIds = stringArray(scenario.learningObjectives, `${id}.learningObjectives`);
        attestable = true;
      }
    }

    definitions.push({
      id,
      mode,
      version: nonEmptyString(definition.version, `${id}.version`),
      points,
      estimatedMinutes,
      fastRunThresholdRatio: ratio(definition.fastRunThresholdRatio, `${id}.fastRunThresholdRatio`),
      productId,
      productVersion,
      learningObjectiveIds,
      attestable,
    });
  }

  for (const [id, scenario] of scenarios) {
    if (scenario.mode === "challenge" && !seen.has(id)) {
      throw new Error(
        `Active challenge ${id} requires a scoring definition for ScenarioRun evidence`,
      );
    }
  }

  return definitions.sort((left, right) => left.id.localeCompare(right.id));
}

function jsLiteral(value, indent = 2) {
  return JSON.stringify(value, null, indent)
    .replace(/"([^"\\]+)":/g, "$1:")
    .replace(/\n/g, "\n  ");
}

function generatedDefinitionBody(definitions, projection, attestableOnly) {
  const selected = attestableOnly
    ? definitions.filter((definition) => definition.attestable === true)
    : definitions;
  return selected
    .map(
      (definition) =>
        `  ${JSON.stringify(definition.id)}: ${jsLiteral(projection(definition), 2)},`,
    )
    .join("\n");
}

function replaceDefinition(source, constant, body) {
  const pattern = new RegExp(`const ${constant} = \\{[\\s\\S]*?\\};`);
  if (!pattern.test(source)) throw new Error(`Template does not define ${constant}`);
  return source.replace(pattern, `const ${constant} = {\n${body}\n};`);
}

const definitions = await authoritativeDefinitions();
for (const output of outputs) {
  const templatePath = resolve(root, output.template);
  const source = await readFile(templatePath, "utf8");
  const body = generatedDefinitionBody(
    definitions,
    output.projection,
    output.attestableOnly === true,
  );
  const generated = [
    "// GENERATED by scripts/generate-appsync-scenario-authority.mjs. Do not edit directly.",
    replaceDefinition(source, output.constant, body),
  ].join("\n");
  const formatted = await formatCode(generated, { ...prettierConfig, parser: "babel" });
  await writeFile(resolve(root, output.output), formatted, "utf8");
}
