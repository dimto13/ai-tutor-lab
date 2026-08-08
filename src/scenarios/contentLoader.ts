import { z } from "zod";
import type { Scenario, Validation } from "../types/training";

const workspaceEventNameSchema = z.enum([
  "explorer.opened",
  "folder.opened",
  "workspace.opened",
  "repository.opened",
  "file.created",
  "file.updated",
  "terminal.opened",
  "terminal.command.executed",
  "panel.opened",
  "copilot.prompt.submitted",
  "ui.element.inspected",
]);

const eventValidationSchema = z.object({
  kind: z.literal("event"),
  type: workspaceEventNameSchema,
  match: z.record(z.unknown()).optional(),
  contains: z.record(z.string()).optional(),
});

const stateValidationSchema = z.object({
  kind: z.literal("state"),
  selector: z.string().min(1),
  equals: z.unknown().optional(),
  includes: z.unknown().optional(),
});

export const validationSchema: z.ZodType<Validation> = z.lazy(
  () =>
    z.union([
      eventValidationSchema,
      stateValidationSchema,
      z.object({ kind: z.literal("all"), of: z.array(validationSchema).min(1) }),
    ]) as z.ZodType<Validation>,
);

const stepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  instruction: z.string().min(1),
  why: z.string(),
  helpLevels: z.tuple([z.string(), z.string(), z.string()]),
  expectedEvent: workspaceEventNameSchema.optional(),
  validation: validationSchema.optional(),
  highlightTarget: z.string().min(1).optional(),
  highlightTooltip: z.string().optional(),
  successMessage: z.string(),
});

export const scenarioSchema = z
  .object({
    id: z.string().min(1),
    moduleId: z.string().optional(),
    mode: z.enum(["explore", "guided", "challenge"]).optional(),
    learningLayer: z.enum(["tool", "concept", "ai_workflow"]).optional(),
    title: z.string().min(1),
    description: z.string(),
    learningObjectives: z.array(z.string().min(1)).optional(),
    environment: z
      .object({
        productId: z.string().min(1),
        version: z.string().min(1),
        runtimeAdapterId: z.string().min(1),
      })
      .optional(),
    estimatedMinutes: z.number().nonnegative().optional(),
    points: z.number().nonnegative().optional(),
    exploreTargets: z.array(z.string().min(1)).optional(),
    completionValidation: validationSchema.optional(),
    solutionComparison: z.array(z.string().min(1)).optional(),
    steps: z.array(stepSchema).min(1),
  })
  .superRefine((scenario, ctx) => {
    const ids = new Set<string>();
    for (const step of scenario.steps) {
      if (ids.has(step.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate step id: ${step.id}`,
          path: ["steps"],
        });
      }
      ids.add(step.id);
    }

    if (
      scenario.mode === "explore" &&
      (!scenario.exploreTargets || scenario.exploreTargets.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "explore scenarios require exploreTargets",
        path: ["exploreTargets"],
      });
    }

    if (scenario.mode === "challenge" && !scenario.completionValidation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "challenge scenarios require completionValidation",
        path: ["completionValidation"],
      });
    }
  });

export function parseScenario(raw: unknown): Scenario {
  return scenarioSchema.parse(raw) as Scenario;
}
