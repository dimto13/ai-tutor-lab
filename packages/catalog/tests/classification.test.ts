import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  classifyByIndicators,
  getClassificationLevelsInRankOrder,
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

function assertExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]) {
  assert.deepEqual(Object.keys(value).sort(), [...expectedKeys].sort());
}

test("default classification scheme supports normal commented YAML", async () => {
  const scheme = await loadDefaultScheme();

  assert.deepEqual(
    getClassificationLevelsInRankOrder(scheme).map((level) => [level.id, level.rank]),
    [
      ["public", 0],
      ["internal", 10],
      ["confidential", 20],
      ["strictly_confidential", 30],
    ],
  );
  assert.equal(scheme.defaultOnUncertainty, "escalate");
});

test("default YAML, JSON schema and runtime schema stay synchronized", async () => {
  const source = await readFile(defaultSchemeUrl, "utf8");
  const document = parseClassificationSchemeYaml(source);
  const jsonSchema = JSON.parse(await readFile(jsonSchemaUrl, "utf8")) as {
    $schema: string;
    required: string[];
    $defs: {
      stableId: { pattern: string };
      classificationLevel: { required: string[] };
      indicator: { required: string[] };
      aiToolPolicy: { required: string[] };
      classificationScheme: { required: string[] };
    };
  };

  assert.equal(jsonSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(jsonSchema.$defs.stableId.pattern, "^[A-Za-z0-9][A-Za-z0-9._-]*$");
  assertExactKeys(document as unknown as Record<string, unknown>, jsonSchema.required);
  assertExactKeys(
    document.classificationScheme as unknown as Record<string, unknown>,
    jsonSchema.$defs.classificationScheme.required,
  );

  for (const level of document.classificationScheme.levels) {
    assertExactKeys(level as unknown as Record<string, unknown>, jsonSchema.$defs.classificationLevel.required);
  }
  for (const indicator of document.classificationScheme.indicators) {
    assertExactKeys(
      indicator as unknown as Record<string, unknown>,
      jsonSchema.$defs.indicator.required,
    );
  }
  for (const policy of document.classificationScheme.aiPolicy) {
    assertExactKeys(policy as unknown as Record<string, unknown>, jsonSchema.$defs.aiToolPolicy.required);
  }
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

test("uncertainty escalates to the next configured rank and requires human review", async () => {
  const scheme = await loadDefaultScheme();
  const decision = classifyByIndicators(scheme, ["marking_internal"], { uncertain: true });

  assert.equal(decision.levelId, "confidential");
  assert.equal(decision.requiresHumanReview, true);
  assert.equal(decision.aiDecisions["m365-copilot-tenant"], true);
  assert.equal(decision.aiDecisions["public-ai-chat"], false);
});

test("tenant-specific schemes can replace and reorder the default taxonomy", () => {
  const scheme = parseClassificationScheme({
    tenantId: "firma-iso",
    levels: [
      { id: "secret", label: "Secret", rank: 30 },
      { id: "open", label: "Open", rank: 0 },
      { id: "company", label: "Company", rank: 10 },
    ],
    indicators: [{ id: "customer_name", label: "Customer name", minLevel: "company" }],
    aiPolicy: [{ tool: "approved-ai", maxLevel: "company" }],
    defaultOnUncertainty: "escalate",
  });

  assert.equal(resolveHighestMinimumLevel(scheme, []), "open");
  assert.equal(resolveHighestMinimumLevel(scheme, ["customer_name"]), "company");
  assert.equal(isAiToolAllowed(scheme, "approved-ai", "company"), true);
  assert.equal(
    classifyByIndicators(scheme, ["customer_name"], { uncertain: true }).levelId,
    "secret",
  );
});

test("invalid level references, duplicate ranks and unknown indicators fail closed", async () => {
  assert.throws(
    () =>
      parseClassificationScheme({
        tenantId: "tenant-x",
        levels: [{ id: "public", label: "Public", rank: 0 }],
        indicators: [{ id: "personal", label: "Personal", minLevel: "missing" }],
        aiPolicy: [{ tool: "approved-ai", maxLevel: "public" }],
        defaultOnUncertainty: "escalate",
      }),
    /unknown minLevel: missing/,
  );

  assert.throws(
    () =>
      parseClassificationScheme({
        tenantId: "tenant-x",
        levels: [
          { id: "public", label: "Public", rank: 0 },
          { id: "internal", label: "Internal", rank: 0 },
        ],
        indicators: [{ id: "internal_note", label: "Internal note", minLevel: "internal" }],
        aiPolicy: [{ tool: "approved-ai", maxLevel: "internal" }],
        defaultOnUncertainty: "escalate",
      }),
    /duplicate level rank: 0/,
  );

  const scheme = await loadDefaultScheme();
  assert.throws(
    () => resolveHighestMinimumLevel(scheme, ["unknown_indicator"]),
    /Unknown classification indicator: unknown_indicator/,
  );
});
