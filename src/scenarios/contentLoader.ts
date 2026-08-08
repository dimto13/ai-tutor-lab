import { z } from "zod";
import type { Scenario, Validation } from "@/types/training";

const eventValidationSchema = z.object({
  kind: z.literal("event"),
  type: z.string(),
  match: z.record(z.unknown()).optional(),
  contains: z.record(z.string()).optional(),
});

const stateValidationSchema = z.object({
  kind: z.literal("state"),
  selector: z.string(),
  equals: z.unknown().optional(),
  includes: z.unknown().optional(),
});

const validationSchema: z.ZodType<Validation> = z.lazy(() =>
  z.union([
    eventValidationSchema,
    stateValidationSchema,
    z.object({ kind: z.literal("all"), of: z.array(validationSchema) }),
  ]) as z.ZodType<Validation>,
);

const stepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  instruction: z.string().min(1),
  why: z.string(),
  helpLevels: z.tuple([z.string(), z.string(), z.string()]),
  expectedEvent: z.string().optional(),
  validation: validationSchema.optional(),
  highlightTarget: z.string().optional(),
  highlightTooltip: z.string().optional(),
  successMessage: z.string(),
});

const scenarioSchema = z.object({
  id: z.string().min(1),
  moduleId: z.string().optional(),
  mode: z.enum(["explore", "guided", "challenge"]).optional(),
  learningLayer: z.enum(["tool", "concept", "ai_workflow"]).optional(),
  title: z.string().min(1),
  description: z.string(),
  learningObjectives: z.array(z.string()).optional(),
  environment: z
    .object({
      productId: z.string(),
      version: z.string(),
      runtimeAdapterId: z.string(),
    })
    .optional(),
  estimatedMinutes: z.number().nonnegative().optional(),
  points: z.number().nonnegative().optional(),
  exploreTargets: z.array(z.string()).optional(),
  completionValidation: validationSchema.optional(),
  solutionComparison: z.array(z.string()).optional(),
  steps: z.array(stepSchema),
});

export function parseScenario(raw: unknown): Scenario {
  return scenarioSchema.parse(raw) as Scenario;
}
