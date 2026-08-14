import assert from "node:assert/strict";
import test from "node:test";
import {
  TRAINING_STATE_SCHEMA_VERSION,
  TrainingStateConflictError,
  createTrainingSession,
} from "@ai-train-lab/training-engine";
import type {
  Scenario,
  TrainingSession,
  TrainingStateKey,
  TrainingStateRepository,
  TrainingSubjectRef,
} from "@ai-train-lab/training-engine";

export interface TrainingStateRepositoryContractFixture {
  repositoryFor(subject: TrainingSubjectRef): TrainingStateRepository;
}

const scenario: Scenario = {
  id: "shared-repository-contract.guided",
  mode: "guided",
  title: "Shared repository contract",
  description: "Shared persistence contract fixture",
  steps: [
    {
      id: "one",
      stepType: "explanation",
      title: "One",
      description: "One",
      instruction: "One",
      helpLevels: ["a", "b", "c"],
      successMessage: "done",
    },
    {
      id: "two",
      stepType: "explanation",
      title: "Two",
      description: "Two",
      instruction: "Two",
      helpLevels: ["a", "b", "c"],
      successMessage: "done",
    },
  ],
};

function key(subject: TrainingSubjectRef): TrainingStateKey {
  return {
    subject,
    scenarioId: scenario.id,
    mode: "guided",
  };
}

function richSession(subject: TrainingSubjectRef, lastAction = "first-device"): TrainingSession {
  return {
    ...createTrainingSession(scenario, scenario.id, 100, subject),
    statuses: {
      one: "VALIDATION_FAILED",
      two: "NOT_STARTED",
    },
    activeStepId: "one",
    hintsUsed: 1,
    hintUsage: [{ stepId: "one", level: 2, timestamp: 110 }],
    mistakes: 1,
    activeStepMistakes: 1,
    attempts: [
      {
        id: "attempt-1",
        stepId: "one",
        outcome: "near-miss",
        timestamp: 120,
        message: "retry",
      },
    ],
    lastAction,
    exploredTargets: ["vscode.editor"],
    lastInspectedRef: "vscode.editor",
  };
}

function assertConflict(
  error: unknown,
  expectedRevision: number | null,
  actualRevision: number | null,
): boolean {
  assert.ok(error instanceof TrainingStateConflictError);
  assert.equal(error.expectedRevision, expectedRevision);
  assert.equal(error.actualRevision, actualRevision);
  return true;
}

export function defineTrainingStateRepositoryContract(
  name: string,
  createFixture: () => TrainingStateRepositoryContractFixture,
): void {
  test(`${name}: restores the complete training session on another repository instance`, async () => {
    const fixture = createFixture();
    const subject = { userId: "alice", tenantId: "tenant-a" };
    const stateKey = key(subject);
    const session = richSession(subject);

    const firstDevice = fixture.repositoryFor(subject);
    const written = await firstDevice.saveSession(stateKey, session, {
      expectedRevision: null,
      updatedAt: 1_000,
    });
    assert.equal(written.schemaVersion, TRAINING_STATE_SCHEMA_VERSION);
    assert.equal(written.revision, 1);

    const secondDevice = fixture.repositoryFor(subject);
    const restored = await secondDevice.loadSession(stateKey);
    assert.equal(restored?.schemaVersion, TRAINING_STATE_SCHEMA_VERSION);
    assert.equal(restored?.revision, 1);
    assert.ok(Number.isFinite(restored?.updatedAt));
    assert.deepEqual(restored?.value, session);
  });

  test(`${name}: enforces monotonic revisions and rejects stale session writes`, async () => {
    const fixture = createFixture();
    const subject = { userId: "alice", tenantId: "tenant-a" };
    const stateKey = key(subject);
    const firstDevice = fixture.repositoryFor(subject);
    const secondDevice = fixture.repositoryFor(subject);

    const first = await firstDevice.saveSession(stateKey, richSession(subject, "revision-1"), {
      expectedRevision: null,
    });
    assert.equal(first.revision, 1);

    const second = await firstDevice.saveSession(stateKey, richSession(subject, "revision-2"), {
      expectedRevision: 1,
    });
    assert.equal(second.revision, 2);

    await assert.rejects(
      secondDevice.saveSession(stateKey, richSession(subject, "stale-write"), {
        expectedRevision: 1,
      }),
      (error: unknown) => assertConflict(error, 1, 2),
    );
    assert.equal((await secondDevice.loadSession(stateKey))?.value.lastAction, "revision-2");
  });

  test(`${name}: isolates training state by user and tenant`, async () => {
    const fixture = createFixture();
    const aliceTenantA = { userId: "alice", tenantId: "tenant-a" };
    const bobTenantA = { userId: "bob", tenantId: "tenant-a" };
    const aliceTenantB = { userId: "alice", tenantId: "tenant-b" };

    await fixture
      .repositoryFor(aliceTenantA)
      .saveSession(key(aliceTenantA), richSession(aliceTenantA), {
        expectedRevision: null,
      });

    assert.equal(await fixture.repositoryFor(bobTenantA).loadSession(key(bobTenantA)), null);
    assert.equal(await fixture.repositoryFor(aliceTenantB).loadSession(key(aliceTenantB)), null);
  });

  test(`${name}: restores, revisions and deletes runtime snapshots across repository instances`, async () => {
    const fixture = createFixture();
    const subject = { userId: "alice", tenantId: "tenant-a" };
    const stateKey = key(subject);
    const runtimeId = "vscode-sim";
    const firstDevice = fixture.repositoryFor(subject);
    const secondDevice = fixture.repositoryFor(subject);
    const initialSnapshot = {
      files: ["calculator.py"],
      contents: { "calculator.py": "print('persisted')\n" },
      branch: "feature/persisted",
      panel: "terminal",
    };

    const first = await firstDevice.saveRuntimeSnapshot(stateKey, runtimeId, initialSnapshot, {
      expectedRevision: null,
    });
    assert.equal(first.revision, 1);
    assert.deepEqual(
      (await secondDevice.loadRuntimeSnapshot(stateKey, runtimeId))?.value,
      initialSnapshot,
    );

    const currentSnapshot = { ...initialSnapshot, branch: "feature/current" };
    const second = await firstDevice.saveRuntimeSnapshot(stateKey, runtimeId, currentSnapshot, {
      expectedRevision: 1,
    });
    assert.equal(second.revision, 2);

    await assert.rejects(
      secondDevice.saveRuntimeSnapshot(
        stateKey,
        runtimeId,
        { ...initialSnapshot, branch: "feature/stale" },
        { expectedRevision: 1 },
      ),
      (error: unknown) => assertConflict(error, 1, 2),
    );
    assert.deepEqual(
      (await secondDevice.loadRuntimeSnapshot(stateKey, runtimeId))?.value,
      currentSnapshot,
    );

    await secondDevice.deleteRuntimeSnapshot(stateKey, runtimeId);
    assert.equal(await firstDevice.loadRuntimeSnapshot(stateKey, runtimeId), null);
  });
}
