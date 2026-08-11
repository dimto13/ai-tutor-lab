import assert from "node:assert/strict";
import test from "node:test";

import { createTrainingSession, restoreTrainingSession } from "../src/stateMachine.ts";
import type { TrainingSubjectRef } from "../src/stateMachine.ts";
import type { Scenario, TrainingStep } from "../src/types.ts";

function step(id: string): TrainingStep {
  return {
    id,
    title: id,
    description: "",
    instruction: id,
    helpLevels: ["hint", "instruction", "visual"],
    successMessage: "done",
  };
}

const scenario = {
  id: "identity.guided",
  mode: "guided",
  title: "Identity",
  description: "",
  steps: [step("one")],
} satisfies Scenario;

const alice: TrainingSubjectRef = {
  userId: "alice",
  tenantId: "tenant-a",
};

const bob: TrainingSubjectRef = {
  userId: "bob",
  tenantId: "tenant-a",
};

test("training session stores the cloud-neutral user and tenant reference", () => {
  const session = createTrainingSession(scenario, "session-1", 100, alice);

  assert.deepEqual(session.subject, alice);
});

test("stored progress is restored only for the same user and tenant", () => {
  const stored = {
    ...createTrainingSession(scenario, "session-1", 100, alice),
    statuses: { one: "COMPLETED" },
    activeStepId: null,
    finishedAt: 120,
  };

  const aliceSession = restoreTrainingSession(scenario, "session-1", stored, 200, alice);
  const bobSession = restoreTrainingSession(scenario, "session-1", stored, 200, bob);

  assert.equal(aliceSession.finishedAt, 120);
  assert.equal(aliceSession.statuses.one, "COMPLETED");
  assert.deepEqual(aliceSession.subject, alice);

  assert.equal(bobSession.finishedAt, null);
  assert.equal(bobSession.statuses.one, "ACTIVE");
  assert.deepEqual(bobSession.subject, bob);
});

test("legacy progress without an owner is not adopted by an authenticated user", () => {
  const legacy = {
    statuses: { one: "COMPLETED" },
    activeStepId: null,
    finishedAt: 120,
  };

  const restored = restoreTrainingSession(scenario, "session-1", legacy, 200, alice);

  assert.equal(restored.finishedAt, null);
  assert.equal(restored.statuses.one, "ACTIVE");
  assert.deepEqual(restored.subject, alice);
});
