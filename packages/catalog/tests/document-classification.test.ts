import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseSyntheticDocumentCorpus } from "../src/classification-corpus.ts";
import { parseClassificationSchemeYaml } from "../src/classification.ts";
import {
  classifyDocument,
  classifyExtractedDocument,
  createUtf8TextExtractor,
  supportedDocumentFormats,
  type DocumentTextExtractor,
} from "../src/document-classification.ts";

const corpusUrl = new URL(
  "../../../content/classification/synthetic-document-corpus.de.json",
  import.meta.url,
);
const schemeUrl = new URL(
  "../../../content/classification/default-classification-scheme.yaml",
  import.meta.url,
);

async function fixtures() {
  const corpus = parseSyntheticDocumentCorpus(JSON.parse(await readFile(corpusUrl, "utf8"))).corpus;
  const scheme = parseClassificationSchemeYaml(
    await readFile(schemeUrl, "utf8"),
  ).classificationScheme;
  return { corpus, scheme };
}

test("engine has no false negatives for strictly confidential corpus documents", async () => {
  const { corpus, scheme } = await fixtures();
  const strict = corpus.documents.filter(
    (document) => document.expected.levelId === "strictly_confidential",
  );
  assert.ok(strict.length > 0);

  for (const document of strict) {
    const actual = classifyExtractedDocument(scheme, { format: "txt", text: document.content });
    assert.equal(actual.levelId, "strictly_confidential", document.id);
    assert.equal(actual.requiresHumanReview, document.expected.uncertain, document.id);
  }
});

test("uncertain content escalates conservatively and requests human review", async () => {
  const { scheme } = await fixtures();
  const result = classifyExtractedDocument(scheme, {
    format: "txt",
    text: "Projektfragment ohne belastbare Kennzeichnung oder erkennbares Merkmal.",
  });

  assert.equal(result.uncertain, true);
  assert.equal(result.requiresHumanReview, true);
  assert.equal(result.levelId, "internal");
  assert.match(result.reasons.join(" "), /menschliche Prüfung/);
});

test("tenant keyword rules use only indicators from the shared scheme", async () => {
  const { scheme } = await fixtures();
  const result = classifyExtractedDocument(
    scheme,
    { format: "txt", text: "Projekt NEBULA: technische Entscheidung" },
    { keywordRules: [{ indicatorId: "marking_internal", keywords: ["NEBULA"] }] },
  );

  assert.equal(result.levelId, "internal");
  assert.equal(result.uncertain, false);
  assert.deepEqual(result.triggeredIndicatorIds, ["marking_internal"]);
  assert.throws(
    () =>
      classifyExtractedDocument(
        scheme,
        { format: "txt", text: "NEBULA" },
        { keywordRules: [{ indicatorId: "shadow_indicator", keywords: ["NEBULA"] }] },
      ),
    /Unknown classification indicator/,
  );
});

test("PDF, DOCX, XLSX and TXT are supported through explicit extractor boundaries", async () => {
  const { scheme } = await fixtures();
  assert.deepEqual(supportedDocumentFormats, ["pdf", "docx", "xlsx", "txt"]);

  for (const format of supportedDocumentFormats) {
    const extractor: DocumentTextExtractor = {
      format,
      extract: () => ({ format, text: "GEHALTSLISTE: 5.000 Euro brutto" }),
    };
    const result = await classifyDocument(
      scheme,
      { format, bytes: new Uint8Array([1, 2, 3]), fileName: `fixture.${format}` },
      [extractor],
    );
    assert.equal(result.levelId, "strictly_confidential", format);
  }
});

test("TXT extractor decodes locally and extractor mismatches fail closed", async () => {
  const { scheme } = await fixtures();
  const text = new TextEncoder().encode("INTERN. Projektstatus");
  const result = await classifyDocument(scheme, { format: "txt", bytes: text }, [
    createUtf8TextExtractor(),
  ]);
  assert.equal(result.levelId, "internal");

  const wrong: DocumentTextExtractor = {
    format: "pdf",
    extract: () => ({ format: "txt", text: "INTERN" }),
  };
  await assert.rejects(
    () => classifyDocument(scheme, { format: "pdf", bytes: new Uint8Array() }, [wrong]),
    /format mismatch/,
  );
});
