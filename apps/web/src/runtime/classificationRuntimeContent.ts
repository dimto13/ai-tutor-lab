import rawCorpus from "../../../../content/classification/synthetic-document-corpus.de.json" with { type: "json" };
import defaultSchemeSource from "../../../../content/classification/default-classification-scheme.yaml?raw";
import {
  parseClassificationScheme,
  parseClassificationSchemeYaml,
  parseSyntheticDocumentCorpus,
  syntheticDocumentSchema,
} from "@ai-train-lab/catalog";
import type { RuntimeSeed } from "./runtimeAdapter.ts";

const defaultScheme = parseClassificationSchemeYaml(defaultSchemeSource).classificationScheme;
const defaultCorpus = parseSyntheticDocumentCorpus(rawCorpus).corpus;

function classificationSeedOverrides(seed?: RuntimeSeed): Record<string, unknown> | null {
  const value = seed?.["classificationSimulator"];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function createClassificationRuntimeSeed(seed?: RuntimeSeed): RuntimeSeed {
  const overrides = classificationSeedOverrides(seed);
  const scheme = overrides?.["scheme"]
    ? parseClassificationScheme(overrides["scheme"])
    : defaultScheme;
  const documents = overrides?.["documents"]
    ? syntheticDocumentSchema.array().min(1).parse(overrides["documents"])
    : defaultCorpus.documents;
  const requestedDocumentId = overrides?.["activeDocumentId"];
  const activeDocumentId =
    typeof requestedDocumentId === "string" &&
    documents.some((document) => document.id === requestedDocumentId)
      ? requestedDocumentId
      : (documents[0]?.id ?? null);
  const requestedAiTool = overrides?.["aiTool"];
  const aiTool =
    typeof requestedAiTool === "string" &&
    scheme.aiPolicy.some((policy) => policy.tool === requestedAiTool)
      ? requestedAiTool
      : (scheme.aiPolicy[0]?.tool ?? null);

  return {
    ...seed,
    classificationSimulator: {
      scheme,
      documents,
      activeDocumentId,
      aiTool,
    },
  };
}
