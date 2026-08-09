import { z } from "zod";
import type { Scenario, Validation } from "../types/training";
import { artifactPreviewSeedSchema } from "../runtime/artifactPreviewContent.ts";

const workspaceEventNameSchema = z.enum([
  "explorer.opened",
  "folder.opened",
  "workspace.opened",
  "repository.opened",
  "file.created",
  "file.updated",
  "file.saved",
  "terminal.opened",
  "terminal.command.executed",
  "scm.staged",
  "scm.committed",
  "panel.opened",
  "copilot.enabled.changed",
  "copilot.chat.opened",
  "copilot.conversation.started",
  "copilot.prompt.submitted",
  "copilot.mode.changed",
  "copilot.model.changed",
  "copilot.context.changed",
  "ai.suggestion.shown",
  "ai.suggestion.accepted",
  "ai.suggestion.rejected",
  "artifact.created",
  "artifact.selected",
  "artifact.updated",
  "artifact.viewSwitched",
  "artifact.verified",
  "platform.overview.opened",
  "platform.code.opened",
  "platform.commit.history.opened",
  "platform.pull_requests.opened",
  "platform.branch.created",
  "platform.pull_request.created",
  "platform.pull_request.diff.opened",
  "platform.pull_request.review.replied",
  "platform.pull_request.checks.opened",
  "platform.pull_request.merge_readiness.opened",
  "platform.issues.opened",
  "platform.issue.opened",
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
  excludes: z.unknown().optional(),
  match: z.record(z.unknown()).optional(),
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
  stepType: z.enum(["action", "explanation"]).optional(),
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
  optional: z.boolean().optional(),
});

const audienceSchema = z.object({
  personaId: z.string().min(1),
  glossaryConcepts: z.array(z.string().min(1)).min(1),
  introductionStepIds: z.array(z.string().min(1)).min(1).optional(),
});

const resourceSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  url: z.string().url(),
  kind: z.enum(["official", "video", "reference"]),
  verifiedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const nonBlankSeedStringSchema = z.string().trim().min(1);

const copilotInlineSuggestionSeedSchema = z
  .object({
    file: nonBlankSeedStringSchema,
    text: z.string().min(1),
    whenContentEquals: z.string().optional(),
  })
  .strict();

const copilotChatResponseSeedSchema = z
  .object({
    response: z.string().min(1),
    file: nonBlankSeedStringSchema.optional(),
    promptContains: nonBlankSeedStringSchema.optional(),
  })
  .strict();

export const runtimeSeedSchema = z
  .object({
    inlineSuggestions: z.array(copilotInlineSuggestionSeedSchema).optional(),
    chatResponses: z.array(copilotChatResponseSeedSchema).optional(),
    artifactPreview: artifactPreviewSeedSchema.optional(),
  })
  .catchall(z.unknown());

const integrationEnvironmentSchema = z
  .object({
    productId: z.string().min(1),
    version: z.string().min(1),
    runtimeAdapterId: z.string().min(1),
  })
  .strict();

export const scenarioSchema = z
  .object({
    id: z.string().min(1),
    moduleId: z.string().optional(),
    mode: z.enum(["explore", "guided", "challenge"]).optional(),
    learningLayer: z.enum(["tool", "concept", "ai_workflow"]).optional(),
    title: z.string().min(1),
    description: z.string(),
    learningObjectives: z.array(z.string().min(1)).optional(),
    audience: audienceSchema.optional(),
    environment: z
      .object({
        productId: z.string().min(1),
        version: z.string().min(1),
        runtimeAdapterId: z.string().min(1),
        integrations: z.array(integrationEnvironmentSchema).optional(),
        seed: runtimeSeedSchema.optional(),
      })
      .strict()
      .optional(),
    estimatedMinutes: z.number().nonnegative().optional(),
    points: z.number().nonnegative().optional(),
    timeLimitSeconds: z.number().int().positive().optional(),
    resources: z.array(resourceSchema).optional(),
    exploreTargets: z.array(z.string().min(1)).optional(),
    completionValidation: validationSchema.optional(),
    solutionComparison: z.array(z.string().min(1)).optional(),
    steps: z.array(stepSchema).min(1),
  })
  .superRefine((scenario, ctx) => {
    const ids = new Set<string>();
    scenario.steps.forEach((step, index) => {
      if (ids.has(step.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate step id: ${step.id}`,
          path: ["steps", index, "id"],
        });
      }
      ids.add(step.id);

      if (step.stepType === "explanation" && (step.validation || step.expectedEvent)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "explanation steps must not define RuntimeEvent validation",
          path: ["steps", index],
        });
      }
    });

    const runtimeIds = [
      scenario.environment?.runtimeAdapterId,
      ...(scenario.environment?.integrations?.map(({ runtimeAdapterId }) => runtimeAdapterId) ??
        []),
    ].filter((id): id is string => Boolean(id));
    if (new Set(runtimeIds).size !== runtimeIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "runtime adapter ids must be unique within an environment",
        path: ["environment", "integrations"],
      });
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

    if (scenario.timeLimitSeconds !== undefined && scenario.mode !== "challenge") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "timeLimitSeconds is only valid for challenge scenarios",
        path: ["timeLimitSeconds"],
      });
    }
  });

export function parseScenario(raw: unknown): Scenario {
  const scenario = scenarioSchema.parse(raw);
  if (!scenario.environment) return scenario as Scenario;

  return {
    ...scenario,
    environment: {
      ...scenario.environment,
      integrationRuntimeAdapterIds: scenario.environment.integrations?.map(
        ({ runtimeAdapterId }) => runtimeAdapterId,
      ),
    },
  } as Scenario;
}
