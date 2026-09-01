import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RuntimeAdapter } from "@ai-train-lab/runtime-core";
import { GuidedNavigationCoordinator } from "../src/state/guidedNavigationCoordinator.ts";
import type { TrainingStatePersistence } from "../src/state/trainingStatePersistence.ts";

interface MutableRuntimeState {
  value: string;
}

function runtimeDouble(id: string, state: MutableRuntimeState): RuntimeAdapter {
  return {
    id,
    async snapshot() {
      return { value: state.value };
    },
    async restore(snapshot: unknown) {
      const candidate = snapshot as { value?: unknown };
      if (typeof candidate.value !== "string") throw new Error("invalid runtime snapshot");
      state.value = candidate.value;
    },
  } as unknown as RuntimeAdapter;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("GuidedNavigationCoordinator", () => {
  it("captures every step-entry runtime before slow persistence can observe learner actions", async () => {
    const firstState = { value: "first-entry" };
    const secondState = { value: "second-entry" };
    const firstRuntime = runtimeDouble("runtime:first", firstState);
    const secondRuntime = runtimeDouble("runtime:second", secondState);
    const stored = new Map<string, unknown>();
    const persistenceReadStarted = deferred();
    const releasePersistenceRead = deferred();
    let delayFirstCheckpointRead = true;

    const persistence = {
      async loadRuntimeSnapshot(runtimeId: string) {
        if (delayFirstCheckpointRead && runtimeId.includes("::guided-step-checkpoint::")) {
          delayFirstCheckpointRead = false;
          persistenceReadStarted.resolve();
          await releasePersistenceRead.promise;
        }
        return stored.get(runtimeId) ?? null;
      },
      async saveRuntimeSnapshot(runtimeId: string, snapshot: unknown) {
        stored.set(runtimeId, structuredClone(snapshot));
      },
      async deleteRuntimeSnapshot(runtimeId: string) {
        stored.delete(runtimeId);
      },
    } as unknown as TrainingStatePersistence;

    const coordinator = new GuidedNavigationCoordinator(persistence, [firstRuntime, secondRuntime]);
    const checkpointPromise = coordinator.ensureStepEntryCheckpoints("step-entry");

    await persistenceReadStarted.promise;
    firstState.value = "first-after-action";
    secondState.value = "second-after-action";
    releasePersistenceRead.resolve();
    await checkpointPromise;

    const firstCheckpoint = stored.get("runtime:first::guided-step-checkpoint::step-entry") as {
      stepId: string;
      snapshot: { value: string };
    };
    const secondCheckpoint = stored.get("runtime:second::guided-step-checkpoint::step-entry") as {
      stepId: string;
      snapshot: { value: string };
    };

    assert.equal(firstCheckpoint.stepId, "step-entry");
    assert.equal(firstCheckpoint.snapshot.value, "first-entry");
    assert.equal(secondCheckpoint.stepId, "step-entry");
    assert.equal(secondCheckpoint.snapshot.value, "second-entry");

    await coordinator.enterReplay("step-entry", "furthest-step");
    assert.equal(firstState.value, "first-entry");
    assert.equal(secondState.value, "second-entry");

    await coordinator.returnToFurthest("furthest-step");
    assert.equal(firstState.value, "first-after-action");
    assert.equal(secondState.value, "second-after-action");
  });
});
