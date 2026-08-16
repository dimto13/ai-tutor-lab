import type { RuntimeAdapter } from "@ai-train-lab/runtime-core";
import { canNavigateToGuidedStep } from "@ai-train-lab/training-engine";
import type { Scenario, TrainingSession } from "@ai-train-lab/training-engine";
import { TrainingStatePersistence } from "./trainingStatePersistence";

const GUIDED_NAVIGATION_VERSION = 1 as const;
const GUIDED_NAVIGATION_STATE_RUNTIME_ID = "guided-navigation::state";

interface GuidedNavigationState {
  version: typeof GUIDED_NAVIGATION_VERSION;
  replayStepId: string;
}

interface GuidedStepCheckpoint {
  version: typeof GUIDED_NAVIGATION_VERSION;
  stepId: string;
  snapshot: unknown;
}

interface GuidedReturnCheckpoint {
  version: typeof GUIDED_NAVIGATION_VERSION;
  returnStepId: string;
  snapshot: unknown;
}

function stepCheckpointRuntimeId(runtimeId: string, stepId: string): string {
  return `${runtimeId}::guided-step-checkpoint::${encodeURIComponent(stepId)}`;
}

function returnCheckpointRuntimeId(runtimeId: string): string {
  return `${runtimeId}::guided-replay-return`;
}

function parseNavigationState(value: unknown): GuidedNavigationState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<GuidedNavigationState>;
  if (
    candidate.version !== GUIDED_NAVIGATION_VERSION ||
    typeof candidate.replayStepId !== "string"
  ) {
    return null;
  }
  return {
    version: GUIDED_NAVIGATION_VERSION,
    replayStepId: candidate.replayStepId,
  };
}

function parseStepCheckpoint(value: unknown): GuidedStepCheckpoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<GuidedStepCheckpoint>;
  if (
    candidate.version !== GUIDED_NAVIGATION_VERSION ||
    typeof candidate.stepId !== "string" ||
    !Object.prototype.hasOwnProperty.call(candidate, "snapshot")
  ) {
    return null;
  }
  return {
    version: GUIDED_NAVIGATION_VERSION,
    stepId: candidate.stepId,
    snapshot: candidate.snapshot,
  };
}

function parseReturnCheckpoint(value: unknown): GuidedReturnCheckpoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<GuidedReturnCheckpoint>;
  if (
    candidate.version !== GUIDED_NAVIGATION_VERSION ||
    typeof candidate.returnStepId !== "string" ||
    !Object.prototype.hasOwnProperty.call(candidate, "snapshot")
  ) {
    return null;
  }
  return {
    version: GUIDED_NAVIGATION_VERSION,
    returnStepId: candidate.returnStepId,
    snapshot: candidate.snapshot,
  };
}

/**
 * Application-layer coordinator for deliberate Guided replay.
 * Runtime snapshots stay opaque and all product semantics remain in adapters.
 */
export class GuidedNavigationCoordinator {
  constructor(
    private readonly persistence: TrainingStatePersistence,
    private readonly runtimes: readonly RuntimeAdapter[],
  ) {}

  async loadReplayStepId(session: TrainingSession, scenario: Scenario): Promise<string | null> {
    const state = parseNavigationState(
      await this.persistence.loadRuntimeSnapshot(GUIDED_NAVIGATION_STATE_RUNTIME_ID),
    );
    if (!state) return null;
    if (!canNavigateToGuidedStep(session, scenario, state.replayStepId)) return null;
    return session.statuses[state.replayStepId] === "COMPLETED" ? state.replayStepId : null;
  }

  async ensureStepEntryCheckpoints(stepId: string): Promise<void> {
    for (const runtime of this.runtimes) {
      const slot = stepCheckpointRuntimeId(runtime.id, stepId);
      const existing = parseStepCheckpoint(await this.persistence.loadRuntimeSnapshot(slot));
      if (existing?.stepId === stepId) continue;
      const snapshot = await runtime.snapshot();
      await this.persistence.saveRuntimeSnapshot(slot, {
        version: GUIDED_NAVIGATION_VERSION,
        stepId,
        snapshot,
      } satisfies GuidedStepCheckpoint);
    }
  }

  async enterReplay(targetStepId: string, returnStepId: string): Promise<void> {
    const returnSnapshots = await Promise.all(
      this.runtimes.map(async (runtime) => ({ runtime, snapshot: await runtime.snapshot() })),
    );
    for (const { runtime, snapshot } of returnSnapshots) {
      const slot = returnCheckpointRuntimeId(runtime.id);
      await this.persistence.loadRuntimeSnapshot(slot);
      await this.persistence.saveRuntimeSnapshot(slot, {
        version: GUIDED_NAVIGATION_VERSION,
        returnStepId,
        snapshot,
      } satisfies GuidedReturnCheckpoint);
    }
    await this.restoreStep(targetStepId);
    await this.persistReplayStep(targetStepId);
  }

  async switchReplay(targetStepId: string): Promise<void> {
    await this.restoreStep(targetStepId);
    await this.persistReplayStep(targetStepId);
  }

  async returnToFurthest(returnStepId: string): Promise<void> {
    const checkpoints = await Promise.all(
      this.runtimes.map(async (runtime) => {
        const checkpoint = parseReturnCheckpoint(
          await this.persistence.loadRuntimeSnapshot(returnCheckpointRuntimeId(runtime.id)),
        );
        if (!checkpoint || checkpoint.returnStepId !== returnStepId) {
          throw new Error(`Guided return checkpoint unavailable for ${runtime.id}`);
        }
        return { runtime, checkpoint };
      }),
    );

    for (const { runtime, checkpoint } of checkpoints) {
      await runtime.restore(checkpoint.snapshot);
      await this.persistence.loadRuntimeSnapshot(runtime.id);
      await this.persistence.saveRuntimeSnapshot(runtime.id, checkpoint.snapshot);
    }

    await this.deleteReplayState();
    for (const { runtime } of checkpoints) {
      await this.persistence
        .deleteRuntimeSnapshot(returnCheckpointRuntimeId(runtime.id))
        .catch(() => undefined);
    }
  }

  async reset(stepIds: readonly string[]): Promise<void> {
    await this.deleteReplayState();
    for (const runtime of this.runtimes) {
      await this.persistence
        .deleteRuntimeSnapshot(returnCheckpointRuntimeId(runtime.id))
        .catch(() => undefined);
      for (const stepId of stepIds) {
        await this.persistence
          .deleteRuntimeSnapshot(stepCheckpointRuntimeId(runtime.id, stepId))
          .catch(() => undefined);
      }
    }
  }

  private async restoreStep(stepId: string): Promise<void> {
    const checkpoints = await Promise.all(
      this.runtimes.map(async (runtime) => {
        const checkpoint = parseStepCheckpoint(
          await this.persistence.loadRuntimeSnapshot(stepCheckpointRuntimeId(runtime.id, stepId)),
        );
        if (!checkpoint || checkpoint.stepId !== stepId) {
          throw new Error(`Guided step checkpoint unavailable for ${runtime.id}/${stepId}`);
        }
        return { runtime, checkpoint };
      }),
    );

    for (const { runtime, checkpoint } of checkpoints) {
      await runtime.restore(checkpoint.snapshot);
      await this.persistence.loadRuntimeSnapshot(runtime.id);
      await this.persistence.saveRuntimeSnapshot(runtime.id, checkpoint.snapshot);
    }
  }

  private async persistReplayStep(stepId: string): Promise<void> {
    await this.persistence.loadRuntimeSnapshot(GUIDED_NAVIGATION_STATE_RUNTIME_ID);
    await this.persistence.saveRuntimeSnapshot(GUIDED_NAVIGATION_STATE_RUNTIME_ID, {
      version: GUIDED_NAVIGATION_VERSION,
      replayStepId: stepId,
    } satisfies GuidedNavigationState);
  }

  private async deleteReplayState(): Promise<void> {
    await this.persistence
      .deleteRuntimeSnapshot(GUIDED_NAVIGATION_STATE_RUNTIME_ID)
      .catch(() => undefined);
  }
}
