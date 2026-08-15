import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyByIndicators, parseClassificationSchemeYaml } from "../src/classification.ts";
import { parseSyntheticDocumentCorpus } from "../src/classification-corpus.ts";

const corpusUrl = new URL(
  "../../../content/classification/synthetic-document-corpus.de.json",
  import.meta.url,
);
const defaultSchemeUrl = new URL(
  "../../../content/classification/default-classification-scheme.yaml",
  import.meta.url,
);

async function loadCorpus() {
  const raw = JSON.parse(await readFile(corpusUrl, "utf8")) as unknown;
  return parseSyntheticDocumentCorpus(raw).corpus;
}

async function loadDefaultScheme() {
  const source = await readFile(defaultSchemeUrl, "utf8");
  return parseClassificationSchemeYaml(source).classificationScheme;
}

test("synthetic corpus covers the requested size, markings and boundary cases", async () => {
  const corpus = await loadCorpus();

  assert.equal(corpus.allEntitiesAndNumbersFictional, true);
  assert.equal(corpus.documents.length, 20);
  assert.equal(corpus.documents.filter((document) => document.boundaryCase).length, 5);

  for (const document of corpus.documents) {
    assert.equal(document.synthetic, true, document.id);
    assert.ok(document.content.startsWith(corpus.syntheticMarker), document.id);
  }
});

test("document features and expected indicator lists stay synchronized", async () => {
  const corpus = await loadCorpus();

  for (const document of corpus.documents) {
    const featureIndicatorIds = [
      ...new Set(
        document.features
          .map((feature) => feature.indicatorId)
          .filter((indicatorId): indicatorId is string => indicatorId !== undefined),
      ),
    ].sort();
    const expectedIndicatorIds = [...new Set(document.expected.indicatorIds)].sort();

    assert.deepEqual(featureIndicatorIds, expectedIndicatorIds, document.id);
  }
});

test("every expected classification is reproduced by the shared ClassificationScheme", async () => {
  const corpus = await loadCorpus();
  const scheme = await loadDefaultScheme();

  for (const document of corpus.documents) {
    const actual = classifyByIndicators(scheme, document.expected.indicatorIds, {
      uncertain: document.expected.uncertain,
    });

    assert.equal(actual.levelId, document.expected.levelId, document.id);
    assert.deepEqual(actual.aiDecisions, document.expected.aiDecisions, document.id);
    assert.equal(
      actual.requiresHumanReview,
      document.expected.requiresHumanReview,
      document.id,
    );
  }
});

test("corpus includes all document families named by AITP-123", async () => {
  const corpus = await loadCorpus();
  const documentTypes = new Set(corpus.documents.map((document) => document.documentType));

  for (const requiredType of [
    "sales_offer",
    "salary_list",
    "press_release",
    "customer_contract",
    "meeting_note",
    "org_chart",
    "source_code",
    "support_ticket",
  ]) {
    assert.ok(documentTypes.has(requiredType), requiredType);
  }
});

test("boundary cases exercise both false-positive avoidance and uncertainty escalation", async () => {
  const corpus = await loadCorpus();
  const boundaryCases = corpus.documents.filter((document) => document.boundaryCase);

  assert.ok(
    boundaryCases.some(
      (document) => document.id === "boundary-placeholder-template" && document.expected.levelId === "internal",
    ),
  );
  assert.ok(
    boundaryCases.some(
      (document) => document.id === "boundary-public-role-no-name" && document.expected.levelId === "public",
    ),
  );
  assert.ok(
    boundaryCases.some(
      (document) =>
        document.id === "boundary-ambiguous-ticket" &&
        document.expected.uncertain &&
        document.expected.requiresHumanReview &&
        document.expected.levelId === "strictly_confidential",
    ),
  );
});
