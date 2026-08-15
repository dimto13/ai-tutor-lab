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

async function loadRawCorpus() {
  return JSON.parse(await readFile(corpusUrl, "utf8")) as unknown;
}

async function loadCorpus() {
  return parseSyntheticDocumentCorpus(await loadRawCorpus()).corpus;
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

test("corpus schema rejects broken synthetic-data invariants", async () => {
  const valid = parseSyntheticDocumentCorpus(await loadRawCorpus());

  const duplicateId = structuredClone(valid);
  const firstDocument = duplicateId.corpus.documents[0];
  const secondDocument = duplicateId.corpus.documents[1];
  assert.ok(firstDocument);
  assert.ok(secondDocument);
  secondDocument.id = firstDocument.id;
  assert.throws(() => parseSyntheticDocumentCorpus(duplicateId), /duplicate synthetic document id/);

  const missingMarker = structuredClone(valid);
  const markerDocument = missingMarker.corpus.documents[0];
  assert.ok(markerDocument);
  markerDocument.content = "Pressemitteilung ohne Synthetik-Hinweis";
  assert.throws(
    () => parseSyntheticDocumentCorpus(missingMarker),
    /synthetic marker must prefix document content/,
  );

  const tooFewBoundaryCases = structuredClone(valid);
  for (const document of tooFewBoundaryCases.corpus.documents) {
    delete document.boundaryCase;
  }
  assert.throws(
    () => parseSyntheticDocumentCorpus(tooFewBoundaryCases),
    /synthetic corpus must contain at least five boundary cases/,
  );
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

test("all corpus references exist in the shared ClassificationScheme", async () => {
  const corpus = await loadCorpus();
  const scheme = await loadDefaultScheme();
  const knownIndicatorIds = new Set(scheme.indicators.map((indicator) => indicator.id));
  const knownLevelIds = new Set(scheme.levels.map((level) => level.id));
  const configuredTools = scheme.aiPolicy.map((policy) => policy.tool).sort();

  for (const document of corpus.documents) {
    for (const indicatorId of document.expected.indicatorIds) {
      assert.ok(knownIndicatorIds.has(indicatorId), `${document.id}: ${indicatorId}`);
    }
    for (const feature of document.features) {
      if (feature.indicatorId) {
        assert.ok(
          knownIndicatorIds.has(feature.indicatorId),
          `${document.id}: ${feature.indicatorId}`,
        );
      }
    }
    assert.ok(knownLevelIds.has(document.expected.levelId), document.id);
    assert.deepEqual(
      Object.keys(document.expected.aiDecisions).sort(),
      configuredTools,
      document.id,
    );
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
    assert.equal(actual.requiresHumanReview, document.expected.requiresHumanReview, document.id);
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
      (document) =>
        document.id === "boundary-placeholder-template" && document.expected.levelId === "internal",
    ),
  );
  assert.ok(
    boundaryCases.some(
      (document) =>
        document.id === "boundary-public-role-no-name" && document.expected.levelId === "public",
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
