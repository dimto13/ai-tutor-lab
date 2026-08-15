/// <reference path="./js-yaml.d.ts" />

import { load as loadYaml } from "js-yaml";
import { z } from "zod";

const classificationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const classificationIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(classificationIdPattern, "must be a stable identifier");

export const classificationLevelSchema = z
  .object({
    id: classificationIdSchema,
    label: z.string().trim().min(1),
    rank: z.number().int().nonnegative(),
  })
  .strict();

export const classificationIndicatorSchema = z
  .object({
    id: classificationIdSchema,
    label: z.string().trim().min(1),
    minLevel: classificationIdSchema,
  })
  .strict();

export const aiToolPolicySchema = z
  .object({
    tool: classificationIdSchema,
    maxLevel: classificationIdSchema,
  })
  .strict();

export const classificationSchemeSchema = z
  .object({
    tenantId: classificationIdSchema,
    levels: z.array(classificationLevelSchema).min(1),
    indicators: z.array(classificationIndicatorSchema).min(1),
    aiPolicy: z.array(aiToolPolicySchema).min(1),
    defaultOnUncertainty: z.literal("escalate"),
  })
  .strict()
  .superRefine((scheme, ctx) => {
    const levelIds = new Set<string>();
    const levelRanks = new Set<number>();
    scheme.levels.forEach((level, index) => {
      if (levelIds.has(level.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate level id: ${level.id}`,
          path: ["levels", index, "id"],
        });
      }
      levelIds.add(level.id);

      if (levelRanks.has(level.rank)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate level rank: ${level.rank}`,
          path: ["levels", index, "rank"],
        });
      }
      levelRanks.add(level.rank);
    });

    const indicatorIds = new Set<string>();
    scheme.indicators.forEach((indicator, index) => {
      if (indicatorIds.has(indicator.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate indicator id: ${indicator.id}`,
          path: ["indicators", index, "id"],
        });
      }
      indicatorIds.add(indicator.id);

      if (!levelIds.has(indicator.minLevel)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown minLevel: ${indicator.minLevel}`,
          path: ["indicators", index, "minLevel"],
        });
      }
    });

    const tools = new Set<string>();
    scheme.aiPolicy.forEach((policy, index) => {
      if (tools.has(policy.tool)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate AI tool policy: ${policy.tool}`,
          path: ["aiPolicy", index, "tool"],
        });
      }
      tools.add(policy.tool);

      if (!levelIds.has(policy.maxLevel)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown maxLevel: ${policy.maxLevel}`,
          path: ["aiPolicy", index, "maxLevel"],
        });
      }
    });
  });

export const classificationSchemeDocumentSchema = z
  .object({
    classificationScheme: classificationSchemeSchema,
  })
  .strict();

export type ClassificationLevel = z.infer<typeof classificationLevelSchema>;
export type ClassificationIndicator = z.infer<typeof classificationIndicatorSchema>;
export type AiToolPolicy = z.infer<typeof aiToolPolicySchema>;
export type ClassificationScheme = z.infer<typeof classificationSchemeSchema>;
export type ClassificationSchemeDocument = z.infer<typeof classificationSchemeDocumentSchema>;

export interface ClassificationDecision {
  levelId: string;
  triggeredIndicatorIds: string[];
  aiDecisions: Record<string, boolean>;
  requiresHumanReview: boolean;
}

export function parseClassificationScheme(raw: unknown): ClassificationScheme {
  return classificationSchemeSchema.parse(raw);
}

export function parseClassificationSchemeDocument(raw: unknown): ClassificationSchemeDocument {
  return classificationSchemeDocumentSchema.parse(raw);
}

export function parseClassificationSchemeYaml(source: string): ClassificationSchemeDocument {
  let raw: unknown;
  try {
    raw = loadYaml(source);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid classification scheme YAML: ${detail}`);
  }
  return parseClassificationSchemeDocument(raw);
}

export function getClassificationLevelRank(scheme: ClassificationScheme, levelId: string): number {
  const level = scheme.levels.find((candidate) => candidate.id === levelId);
  if (!level) {
    throw new Error(`Unknown classification level: ${levelId}`);
  }
  return level.rank;
}

export function getClassificationLevelsInRankOrder(
  scheme: ClassificationScheme,
): ClassificationLevel[] {
  return [...scheme.levels].sort((left, right) => left.rank - right.rank);
}

export function resolveHighestMinimumLevel(
  scheme: ClassificationScheme,
  indicatorIds: readonly string[],
): string {
  const orderedLevels = getClassificationLevelsInRankOrder(scheme);
  let selectedLevel = orderedLevels[0];
  if (!selectedLevel) {
    throw new Error("Classification scheme must contain at least one level");
  }

  const indicatorsById = new Map(scheme.indicators.map((indicator) => [indicator.id, indicator]));
  const levelsById = new Map(scheme.levels.map((level) => [level.id, level]));

  for (const indicatorId of new Set(indicatorIds)) {
    const indicator = indicatorsById.get(indicatorId);
    if (!indicator) {
      throw new Error(`Unknown classification indicator: ${indicatorId}`);
    }
    const candidateLevel = levelsById.get(indicator.minLevel);
    if (!candidateLevel) {
      throw new Error(`Unknown classification level: ${indicator.minLevel}`);
    }
    if (candidateLevel.rank > selectedLevel.rank) {
      selectedLevel = candidateLevel;
    }
  }

  return selectedLevel.id;
}

export function isAiToolAllowed(
  scheme: ClassificationScheme,
  tool: string,
  levelId: string,
): boolean {
  const levelRank = getClassificationLevelRank(scheme, levelId);
  const policy = scheme.aiPolicy.find((entry) => entry.tool === tool);
  if (!policy) return false;
  return levelRank <= getClassificationLevelRank(scheme, policy.maxLevel);
}

export function classifyByIndicators(
  scheme: ClassificationScheme,
  indicatorIds: readonly string[],
  options: { uncertain?: boolean } = {},
): ClassificationDecision {
  const triggeredIndicatorIds = [...new Set(indicatorIds)];
  const baseLevelId = resolveHighestMinimumLevel(scheme, triggeredIndicatorIds);
  const orderedLevels = getClassificationLevelsInRankOrder(scheme);
  const baseIndex = orderedLevels.findIndex((level) => level.id === baseLevelId);
  if (baseIndex < 0) {
    throw new Error(`Unknown classification level: ${baseLevelId}`);
  }

  const uncertain = options.uncertain === true;
  const resolvedIndex = uncertain ? Math.min(baseIndex + 1, orderedLevels.length - 1) : baseIndex;
  const level = orderedLevels[resolvedIndex];
  if (!level) {
    throw new Error("Classification scheme must contain at least one level");
  }
  const levelId = level.id;

  return {
    levelId,
    triggeredIndicatorIds,
    aiDecisions: Object.fromEntries(
      scheme.aiPolicy.map((policy) => [policy.tool, isAiToolAllowed(scheme, policy.tool, levelId)]),
    ),
    requiresHumanReview: uncertain,
  };
}
