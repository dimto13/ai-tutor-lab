import rawModuleLineCatalog from "../../../content/catalog/module-lines.json" with { type: "json" };
import rawCatalog from "../../../content/catalog/technology-catalog.json" with { type: "json" };
import { parseModuleLineCatalog } from "./module-lines.ts";
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
  DidacticPattern,
  DidacticPhase,
  ModuleLine,
  ModuleLineCatalog,
  VerificationContract,
} from "./module-lines.ts";
export {
  didacticPatternSchema,
  didacticPhaseSchema,
  getDidacticPatternById,
  getModuleLineById,
  moduleLineCatalogSchema,
  moduleLineSchema,
  parseModuleLineCatalog,
  verificationContractSchema,
} from "./module-lines.ts";
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

export const moduleLineCatalog = parseModuleLineCatalog(rawModuleLineCatalog);
export const technologyCatalog = parseTechnologyCatalog(rawCatalog);
