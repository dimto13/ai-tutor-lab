import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  classifyByIndicators,
  isAiToolAllowed,
  parseClassificationScheme,
  parseClassificationSchemeYaml,
  resolveHighestMinimumLevel,
} from "../src/classification.ts";

const defaultSchemeUrl = new URL(
  "../../../content/classification/default-classification-scheme.yaml",
  import.meta.url,
);
const jsonSchemaUrl = new URL(
  "../../../content/classification/classification-scheme.schema.json",
  import.meta.url,
);

async function loadDefaultScheme() {
  const source = await readFile(defaultSchemeUrl, "utf8");
  return parseClassificationSchemeYaml(source).classificationScheme;
}

test("default classification scheme is stored as valid YAML 1.2 JSON profile", async () => {
  const scheme = await loadDefaultScheme();

  assert.deepEqual(
    scheme.levels.map((level) => level.id),
    ["public", "internal", "confidential", "strictly_confidential"],
  );
  assert.equal(scheme.defaultOnUncertainty, "escalate");
});

test("classification JSON schema declares the same required document contract", async () => {
  const jsonSchema = JSON.parse(await readFile(jsonSchemaUrl, "utf8")) as {
    $schema: string;
    required: string[];
    $defs: { classificationScheme: { required: string[] } };
  };

  assert.equal(jsonSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.deepEqual(jsonSchema.required, ["classificationScheme"]);
  assert.deepEqual(jsonSchema.$defs.classificationScheme.required, [
    "tenantId",
    "levels",
    "indicators",
    "aiPolicy",
    "defaultOnUncertainty",
  ]);
});

test("highest minimum level wins when multiple indicators trigger", async () => {
  const scheme = await loadDefaultScheme();

  assert.equal(
    resolveHighestMinimumLevel(scheme, ["marking_internal", "personal_data"]),
    "confidential",
  );
  assert.equal(
    resolveHighestMinimumLevel(scheme, ["personal_data", "salary_data"]),
    "strictly_confidential",
  );
});

test("AI policy applies the configured maximum classification level", async () => {
  const scheme = await loadDefaultScheme();

  assert.equal(isAiToolAllowed(scheme, "m365-copilot-tenant", "confidential"), true);
  assert.equal(isAiToolAllowed(scheme, "m365-copilot-tenant", "strictly_confidential"), false);
  assert.equal(isAiToolAllowed(scheme, "public-ai-chat", "internal"), false);
  assert.equal(isAiToolAllowed(scheme, "unconfigured-tool", "public"), false);
});

test("uncertainty escalates one level and requires human review", async () => {
  const scheme = await loadDefaultScheme();
  const decision = classifyByIndicators(scheme, ["marking_internal"], { uncertain: true });

  assert.equal(decision.levelId, "confidential");
  assert.equal(decision.requiresHumanReview, true);
  assert.equal(decision.aiDecisions["m365-copilot-tenant"], true);
  assert.equal(decision.aiDecisions["public-ai-chat"], false);
});

test("tenant-specific schemes can replace the default level taxonomy", () => {
  const scheme = parseClassificationScheme({
    tenantId: "firma-iso",
    levels: [
      { id: "open", label: "Open" },
      { id: "company", label: "Company" },
      { id: "secret", label: "Secret" },
    ],
    indicators: [{ id: "customer_name", label: "Customer name", minLevel: "company" }],
    aiPolicy: [{ tool: "approved-ai", maxLevel: "company" }],
    defaultOnUncertainty: "escalate",
  });

  assert.equal(resolveHighestMinimumLevel(scheme, ["customer_name"]), "company");
  assert.equal(isAiToolAllowed(scheme, "approved-ai", "company"), true);
});

test("invalid level references and unknown indicators fail closed", async () => {
  assert.throws(
    () =>
      parseClassificationScheme({
        tenantId: "tenant-x",
        levels: [{ id: "public", label: "Public" }],
        indicators: [{ id: "personal", label: "Personal", minLevel: "missing" }],
        aiPolicy: [{ tool: "approved-ai", maxLevel: "public" }],
        defaultOnUncertainty: "escalate",
      }),
    /unknown minLevel: missing/,
  );

  const scheme = await loadDefaultScheme();
  assert.throws(
    () => resolveHighestMinimumLevel(scheme, ["unknown_indicator"]),
    /Unknown classification indicator: unknown_indicator/,
  );
});
