import { z } from "zod";

const nonEmptyIdSchema = z.string().trim().min(1);

export const moduleLineLearningLayerSchema = z.enum(["tool", "concept", "ai_workflow"]);

export const verificationContractSchema = z
  .object({
    requiresEmbeddedWeakness: z.literal(true),
    requiresActiveLearnerAction: z.literal(true),
    requiresDeterministicValidation: z.literal(true),
    requiresFeedback: z.literal(true),
  })
  .strict();

export const didacticPhaseSchema = z
  .object({
    id: nonEmptyIdSchema,
    title: z.string().trim().min(1),
    purpose: z.string().trim().min(1),
    verificationContract: verificationContractSchema.optional(),
  })
  .strict();

export const didacticPatternSchema = z
  .object({
    id: nonEmptyIdSchema,
    title: z.string().trim().min(1),
    phases: z.array(didacticPhaseSchema).min(1),
  })
  .strict()
  .superRefine((pattern, ctx) => {
    const phaseIds = new Set<string>();
    pattern.phases.forEach((phase, index) => {
      if (phaseIds.has(phase.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate phase id: ${phase.id}`,
          path: ["phases", index, "id"],
        });
      }
      phaseIds.add(phase.id);
    });
  });

export const moduleLineSchema = z
  .object({
    id: nonEmptyIdSchema,
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    learningLayer: moduleLineLearningLayerSchema,
    patternId: nonEmptyIdSchema,
    moduleIds: z.array(nonEmptyIdSchema).min(1),
  })
  .strict()
  .superRefine((line, ctx) => {
    const moduleIds = new Set<string>();
    line.moduleIds.forEach((moduleId, index) => {
      if (moduleIds.has(moduleId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate module id: ${moduleId}`,
          path: ["moduleIds", index],
        });
      }
      moduleIds.add(moduleId);
    });
  });

export const moduleLineCatalogSchema = z
  .object({
    version: z.literal(1),
    patterns: z.array(didacticPatternSchema).min(1),
    lines: z.array(moduleLineSchema).min(1),
  })
  .strict()
  .superRefine((catalog, ctx) => {
    const patternIds = new Set<string>();
    catalog.patterns.forEach((pattern, index) => {
      if (patternIds.has(pattern.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate pattern id: ${pattern.id}`,
          path: ["patterns", index, "id"],
        });
      }
      patternIds.add(pattern.id);
    });

    const lineIds = new Set<string>();
    catalog.lines.forEach((line, index) => {
      if (lineIds.has(line.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate module line id: ${line.id}`,
          path: ["lines", index, "id"],
        });
      }
      lineIds.add(line.id);

      if (!patternIds.has(line.patternId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown patternId: ${line.patternId}`,
          path: ["lines", index, "patternId"],
        });
      }
    });
  });

export type ModuleLineLearningLayer = z.infer<typeof moduleLineLearningLayerSchema>;
export type VerificationContract = z.infer<typeof verificationContractSchema>;
export type DidacticPhase = z.infer<typeof didacticPhaseSchema>;
export type DidacticPattern = z.infer<typeof didacticPatternSchema>;
export type ModuleLine = z.infer<typeof moduleLineSchema>;
export type ModuleLineCatalog = z.infer<typeof moduleLineCatalogSchema>;
export type ModuleLineItem = {
  learningLayer?: ModuleLineLearningLayer;
  moduleId?: string;
};

export function parseModuleLineCatalog(raw: unknown): ModuleLineCatalog {
  return moduleLineCatalogSchema.parse(raw);
}

export function findModuleLineById(
  catalog: ModuleLineCatalog,
  moduleLineId: string,
): ModuleLine | null {
  return catalog.lines.find(({ id }) => id === moduleLineId) ?? null;
}

export function getModuleLineById(catalog: ModuleLineCatalog, moduleLineId: string): ModuleLine {
  const moduleLine = findModuleLineById(catalog, moduleLineId);
  if (!moduleLine) throw new Error(`Unknown module line: ${moduleLineId}`);
  return moduleLine;
}

export function getDidacticPatternById(
  catalog: ModuleLineCatalog,
  patternId: string,
): DidacticPattern | null {
  return catalog.patterns.find(({ id }) => id === patternId) ?? null;
}

export function selectModuleLineItems<T extends ModuleLineItem>(
  catalog: ModuleLineCatalog,
  moduleLineId: string,
  items: Iterable<T>,
): T[] {
  const moduleLine = findModuleLineById(catalog, moduleLineId);
  if (!moduleLine) return [];

  const moduleIds = new Set(moduleLine.moduleIds);
  return [...items].filter(
    (item) =>
      item.learningLayer === moduleLine.learningLayer &&
      item.moduleId !== undefined &&
      moduleIds.has(item.moduleId),
  );
}
