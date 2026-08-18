import { z } from "zod";
import introductionData from "../../../../content/introductions/de.json" with { type: "json" };
import type { Scenario, TrainingStep, Validation } from "../types/training";
import { artifactPreviewSeedSchema } from "../runtime/artifactPreviewContent.ts";

const workspaceEventNameSchema = z.enum([
  "explorer.opened",
  "folder.opened",
  "workspace.opened",
  "repository.opened",
  "file.created",
  "file.updated",
  "file.deleted",
  "file.opened",
  "file.saved",
  "editor.selection.changed",
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
  "copilot.task.stopped",
  "ai.prompt.submitted",
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
  containsAny: z.record(z.array(z.string().min(1)).min(1)).optional(),
});

const stateValidationSchema = z.object({
  kind: z.literal("state"),
  selector: z.string().min(1),
  equals: z.unknown().optional(),
  includes: z.unknown().optional(),
  includesAny: z.array(z.unknown()).min(1).optional(),
  excludes: z.unknown().optional(),
  match: z.record(z.unknown()).optional(),
});

const classificationValidationSchema = z
  .object({
    kind: z.literal("classification"),
    selector: z.string().min(1),
    documentId: z.string().min(1),
    expectedIndicatorIds: z.array(z.string().min(1)),
    expectedLevelId: z.string().min(1),
    expectedAiDecisions: z.record(z.boolean()),
    uncertaintyEscalationFromLevelId: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((validation, ctx) => {
    if (Object.keys(validation.expectedAiDecisions).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "classification validation requires at least one AI usage decision",
        path: ["expectedAiDecisions"],
      });
    }
  });

export const validationSchema: z.ZodType<Validation> = z.lazy(
  () =>
    z.union([
      eventValidationSchema,
      stateValidationSchema,
      classificationValidationSchema,
      z.object({
        kind: z.literal("sequence"),
        of: z.array(validationSchema).min(1),
        ordered: z.boolean(),
      }),
      z.object({ kind: z.literal("all"), of: z.array(validationSchema).min(1) }),
      z.object({ kind: z.literal("any"), of: z.array(validationSchema).min(1) }),
      z.object({ kind: z.literal("not"), of: validationSchema }),
    ]) as z.ZodType<Validation>,
);

const recoveryCommandSchema = z
  .object({
    type: z.string().min(1),
    payload: z.record(z.unknown()).optional(),
  })
  .strict();

const recoveryActionSchema = z
  .object({
    id: z.string().min(1),
    strategy: z.enum(["runtime_repair", "step_snapshot"]),
    message: z.string().min(1),
    label: z.string().min(1),
    runtimeAdapterId: z.string().min(1).optional(),
    command: recoveryCommandSchema.optional(),
  })
  .strict()
  .superRefine((action, ctx) => {
    if (action.strategy === "runtime_repair" && !action.command) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "runtime_repair recovery requires a semantic command",
        path: ["command"],
      });
    }
    if (action.strategy === "step_snapshot" && action.command) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "step_snapshot recovery must not define a runtime command",
        path: ["command"],
      });
    }
  });

const recoveryPolicySchema = z
  .object({
    onValidationFailure: recoveryActionSchema.optional(),
    stateRules: z
      .array(
        z
          .object({
            when: validationSchema,
            action: recoveryActionSchema,
          })
          .strict(),
      )
      .min(1)
      .optional(),
  })
  .strict();

const stepSchema = z.object({
  id: z.string().min(1),
  stepType: z.enum(["action", "explanation"]).optional(),
  title: z.string().min(1),
  description: z.string(),
  instruction: z.string().min(1),
  rationale: z.string().optional(),
  why: z.string().optional(),
  helpLevels: z.tuple([z.string(), z.string(), z.string()]),
  expectedEvent: workspaceEventNameSchema.optional(),
  validation: validationSchema.optional(),
  highlightTarget: z.string().min(1).optional(),
  highlightTooltip: z.string().optional(),
  onFailure: z
    .object({
      message: z.string().min(1),
      markTarget: z.string().min(1).optional(),
    })
    .strict()
    .optional(),
  recovery: recoveryPolicySchema.optional(),
  successMessage: z.string(),
  optional: z.boolean().optional(),
  exactTextValidation: z.boolean().optional(),
});

const introductionLibrarySchema = z
  .object({
    version: z.number().int().positive(),
    language: z.string().min(1),
    steps: z.array(stepSchema).min(1),
  })
  .superRefine((library, ctx) => {
    const ids = new Set<string>();
    library.steps.forEach((step, index) => {
      if (ids.has(step.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate shared introduction step id: ${step.id}`,
          path: ["steps", index, "id"],
        });
      }
      ids.add(step.id);

      if (step.stepType !== "explanation" || !step.optional) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "shared introduction steps must be optional explanation steps",
          path: ["steps", index],
        });
      }
      if (step.validation || step.expectedEvent || step.recovery) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "shared introduction steps must not define RuntimeEvent validation or recovery",
          path: ["steps", index],
        });
      }
    });
  });

const introductionLibrary = introductionLibrarySchema.parse(introductionData);
const sharedIntroductionSteps = new Map<string, TrainingStep>(
  introductionLibrary.steps.map((step) => [step.id, step as TrainingStep]),
);

const audienceSchema = z.object({
  personaId: z.string().min(1),
  glossaryConcepts: z.array(z.string().min(1)).min(1),
  introductionStepRefs: z.array(z.string().min(1)).min(1).optional(),
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
    promptContainsAny: z.array(nonBlankSeedStringSchema).min(1).optional(),
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

const challengeDiagnosticSchema = z
  .object({
    eventTypes: z.array(workspaceEventNameSchema).min(1).optional(),
    when: validationSchema,
    message: z.string().min(1),
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
    challengeDiagnostics: z.array(challengeDiagnosticSchema).min(1).optional(),
    solutionComparison: z.array(z.string().min(1)).optional(),
    steps: z.array(stepSchema).min(1),
  })
  .superRefine((scenario, ctx) => {
    const ids = new Set<string>();
    const runtimeIds = [
      scenario.environment?.runtimeAdapterId,
      ...(scenario.environment?.integrations?.map(({ runtimeAdapterId }) => runtimeAdapterId) ??
        []),
    ].filter((id): id is string => Boolean(id));

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
      if (
        step.recovery &&
        ((scenario.mode ?? "guided") !== "guided" || step.stepType === "explanation")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "recovery is only valid for actionable guided steps",
          path: ["steps", index, "recovery"],
        });
      }
      const recoveryActions = [
        ...(step.recovery?.onValidationFailure ? [step.recovery.onValidationFailure] : []),
        ...(step.recovery?.stateRules?.map(({ action }) => action) ?? []),
      ];
      recoveryActions.forEach((action) => {
        if (action.runtimeAdapterId && !runtimeIds.includes(action.runtimeAdapterId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `recovery runtime ${action.runtimeAdapterId} is not part of the scenario environment`,
            path: ["steps", index, "recovery"],
          });
        }
      });
    });

    const sharedRefs = scenario.audience?.introductionStepRefs ?? [];
    const seenSharedRefs = new Set<string>();
    sharedRefs.forEach((ref, index) => {
      if (seenSharedRefs.has(ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate shared introduction step reference: ${ref}`,
          path: ["audience", "introductionStepRefs", index],
        });
      }
      seenSharedRefs.add(ref);

      if (!sharedIntroductionSteps.has(ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown shared introduction step: ${ref}`,
          path: ["audience", "introductionStepRefs", index],
        });
      }
      if (ids.has(ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `shared introduction step collides with authored step id: ${ref}`,
          path: ["audience", "introductionStepRefs", index],
        });
      }
    });

    if (sharedRefs.length > 0 && (scenario.mode ?? "guided") !== "guided") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "shared introduction steps are only valid for guided scenarios",
        path: ["audience", "introductionStepRefs"],
      });
    }

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

    if (scenario.challengeDiagnostics && scenario.mode !== "challenge") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "challengeDiagnostics are only valid for challenge scenarios",
        path: ["challengeDiagnostics"],
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
  const authoredScenario = scenarioSchema.parse(raw);
  const resolvedIntroductionSteps =
    authoredScenario.audience?.introductionStepRefs?.map((ref) =>
      sharedIntroductionSteps.get(ref)!,
    ) ?? [];
  const authoredIntroductionStepIds = authoredScenario.audience?.introductionStepIds ?? [];
  const introductionStepIds = [
    ...resolvedIntroductionSteps.map((step) => step.id),
    ...authoredIntroductionStepIds,
  ];

  const scenario = {
    ...authoredScenario,
    audience: authoredScenario.audience
      ? {
          ...authoredScenario.audience,
          introductionStepIds: introductionStepIds.length > 0 ? introductionStepIds : undefined,
        }
      : undefined,
    steps: [...resolvedIntroductionSteps, ...authoredScenario.steps],
  } as Scenario;

  if (!scenario.environment) return scenario;

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
