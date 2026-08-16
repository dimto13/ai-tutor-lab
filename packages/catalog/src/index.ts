import rawCatalog from "../../../content/catalog/technology-catalog.json" with { type: "json" };
import { parseTechnologyCatalog } from "./schema.ts";

export type {
  SyntheticDocument,
  SyntheticDocumentCorpus,
  SyntheticDocumentExpected,
  SyntheticDocumentFeature,
} from "./classification-corpus.ts";
export {
  parseSyntheticDocumentCorpus,
  syntheticDocumentCorpusSchema,
  syntheticDocumentExpectedSchema,
  syntheticDocumentFeatureSchema,
  syntheticDocumentSchema,
} from "./classification-corpus.ts";
export type {
  AiToolPolicy,
  ClassificationDecision,
  ClassificationIndicator,
  ClassificationLevel,
  ClassificationScheme,
  ClassificationSchemeDocument,
} from "./classification.ts";
export {
  aiToolPolicySchema,
  classificationIndicatorSchema,
  classificationLevelSchema,
  classificationSchemeDocumentSchema,
  classificationSchemeSchema,
  classifyByIndicators,
  getClassificationLevelRank,
  getClassificationLevelsInRankOrder,
  isAiToolAllowed,
  parseClassificationScheme,
  parseClassificationSchemeDocument,
  parseClassificationSchemeYaml,
  resolveHighestMinimumLevel,
} from "./classification.ts";
export type {
  CatalogEnvironmentReference,
  CatalogEnvironmentValidationIssue,
  CatalogIntegrationReference,
} from "./environment.ts";
export { validateCatalogEnvironmentReference } from "./environment.ts";
export type {
  Capability,
  Integration,
  Product,
  ProductVersion,
  Provider,
  RuntimeAdapterDefinition,
  Technology,
  TechnologyCatalog,
  TechnologyId,
} from "./types.ts";

export { capabilitySchema, parseTechnologyCatalog, technologyCatalogSchema } from "./schema.ts";

export const technologyCatalog = parseTechnologyCatalog(rawCatalog);
