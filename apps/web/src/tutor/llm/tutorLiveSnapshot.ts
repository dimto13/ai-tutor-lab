import { z } from "zod";
import type { TutorContext } from "../tutorContext";

/** Only non-sensitive event *names* may cross the tutor LLM boundary. Never event payloads. */
export const TUTOR_SAFE_EVENT_TYPES = [
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
] as const;

const safeEventTypeSchema = z.enum(TUTOR_SAFE_EVENT_TYPES);
const safeEventTypes = new Set<string>(TUTOR_SAFE_EVENT_TYPES);

/** Status of the *displayed* step only, as reported by the client. */
export const tutorReportedStepStatusSchema = z.enum([
  "NOT_STARTED",
  "ACTIVE",
  "COMPLETED",
  "SKIPPED",
  "VALIDATION_FAILED",
]);

/**
 * Browser-reported observations only. None of these fields authorizes step completion,
 * scoring, access, or other security decisions. Event payloads, user code, file paths
 * and document contents must NEVER be serialized into this contract.
 */
export const tutorLiveSnapshotSchema = z
  .object({
    completedStepIds: z.array(z.string().min(1).max(200)).max(50),
    hintsUsed: z.number().int().min(0).max(10_000),
    failedAttempts: z.number().int().min(0).max(10_000),
    currentStepStatus: tutorReportedStepStatusSchema.optional(),
    exploredTargets: z.number().int().min(0).max(10_000),
    recentEventTypes: z.array(safeEventTypeSchema).max(6),
    /** Optional guide-rendered diagnostic; only an exact authored message may reach the model. */
    lastFailure: z.string().trim().min(1).max(600).optional(),
  })
  .strict();

export type TutorLiveSnapshot = z.infer<typeof tutorLiveSnapshotSchema>;
export type TutorSafeEventType = (typeof TUTOR_SAFE_EVENT_TYPES)[number];

export interface TutorReportedLearnerState {
  completedSteps: number;
  /** Canonical, scenario-filtered IDs, never trusted as scoring evidence. */
  completedStepIds: readonly string[];
  currentStepReportedCompleted: boolean;
  /** Browser observation about the *displayed* step, including VALIDATION_FAILED. */
  currentStepStatus?: z.infer<typeof tutorReportedStepStatusSchema>;
  /** Only if the server matched an exact diagnostic authored in this step. */
  lastFailure?: string;
  hintsUsed: number;
  failedAttempts: number;
  exploredTargets: number;
  recentEventTypes: readonly TutorSafeEventType[];
}

type SnapshotSource = Pick<
  TutorContext,
  "completedStepIds" | "hintUsage" | "failedAttempts" | "recentEvents" | "stateSummary"
> & {
  lastFailure?: string | null;
  currentStepStatus?: z.infer<typeof tutorReportedStepStatusSchema> | null;
};

function boundCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(10_000, Math.trunc(value))) : 0;
}

/** Client helper: redact all payloads before sending, not merely when building the prompt. */
export function buildTutorLiveSnapshot(context: SnapshotSource): TutorLiveSnapshot {
  const recentEventTypes = context.recentEvents
    .map((event) => event.type)
    .filter((type): type is TutorSafeEventType => safeEventTypes.has(type))
    .slice(-6);

  const lastFailure = context.lastFailure?.trim();
  return {
    ...(context.currentStepStatus
      ? { currentStepStatus: context.currentStepStatus }
      : {}),
    ...(lastFailure && lastFailure.length <= 600 ? { lastFailure } : {}),
    completedStepIds: [...new Set(context.completedStepIds)]
      .filter((id) => id.length > 0 && id.length <= 200)
      .slice(-50),
    hintsUsed: boundCount(context.hintUsage),
    failedAttempts: boundCount(context.failedAttempts),
    exploredTargets: boundCount(context.stateSummary.exploredTargets),
    recentEventTypes,
  };
}

/** The server constrains claimed step IDs against the canonical, trusted scenario. */
export function summarizeTutorLiveSnapshot(
  snapshot: TutorLiveSnapshot | undefined,
  allowedStepIds: readonly string[],
  currentStepId: string | null,
  authoredFailureMessages: readonly string[] = [],
): TutorReportedLearnerState | null {
  if (!snapshot) return null;
  const parsed = tutorLiveSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return null;
  const validStepIds = new Set(allowedStepIds);
  const completedSteps = [...new Set(parsed.data.completedStepIds)].filter((id) =>
    validStepIds.has(id),
  );
  return {
    completedSteps: completedSteps.length,
    completedStepIds: completedSteps,
    ...(parsed.data.lastFailure && authoredFailureMessages.includes(parsed.data.lastFailure)
      ? { lastFailure: parsed.data.lastFailure }
      : {}),
    currentStepReportedCompleted: currentStepId !== null && completedSteps.includes(currentStepId),
    ...(currentStepId && parsed.data.currentStepStatus
      ? { currentStepStatus: parsed.data.currentStepStatus }
      : {}),
    hintsUsed: parsed.data.hintsUsed,
    failedAttempts: parsed.data.failedAttempts,
    exploredTargets: parsed.data.exploredTargets,
    recentEventTypes: parsed.data.recentEventTypes,
  };
}
