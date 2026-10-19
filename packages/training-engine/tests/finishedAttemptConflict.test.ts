import assert from "node:assert/strict";
import test from "node:test";
import { finishedAttemptSupersedes } from "../src/persistence.ts";
import {
  completeChallenge,
  completeTrainingStep,
  createTrainingSession,
  recordMistake,
  timeoutChallenge,
} from "../src/stateMachine.ts";
import type { Scenario } from "../src/types.ts";

const guided: Scenario = {
  id: "conflict.guided",
  mode: "guided",
  title: "Conflict",
  description: "",
  steps: ["one", "two"].map((id) => ({
    id,
    title: id,
    description: "",
    instruction: id,
    helpLevels: ["a", "b", "c"] as [string, string, string],
    successMessage: "done",
  })),
};

const challenge: Scenario = { ...guided, id: "conflict.challenge", mode: "challenge" };
const alice = { userId: "alice", tenantId: "tenant-a" };

function lastStepActive(startedAt = 1_000) {
  return completeTrainingStep(
    createTrainingSession(guided, guided.id, startedAt, alice),
    guided,
    "one",
    startedAt + 1,
  );
}

const finished = completeTrainingStep(lastStepActive(), guided, "two", 1_100);

test("a finished attempt supersedes its own older unfinished snapshot", () => {
  assert.equal(finishedAttemptSupersedes(finished, lastStepActive()), true);
  assert.equal(finishedAttemptSupersedes(finished, recordMistake(lastStepActive())), true);
});

test("an unfinished local session never overrides the persisted authority", () => {
  assert.equal(finishedAttemptSupersedes(lastStepActive(), lastStepActive()), false);
});

test("a restarted attempt, another user or a missing record keep the persisted authority", () => {
  assert.equal(finishedAttemptSupersedes(finished, lastStepActive(2_000)), false);
  assert.equal(
    finishedAttemptSupersedes(finished, {
      ...lastStepActive(),
      subject: { ...alice, userId: "bob" },
    }),
    false,
  );
  assert.equal(finishedAttemptSupersedes(finished, null), false);
});

test("an already persisted completion keeps the persisted authority", () => {
  const otherCompletion = completeTrainingStep(lastStepActive(), guided, "two", 1_050);
  assert.equal(finishedAttemptSupersedes(finished, otherCompletion), false);
});

test("a timed-out challenge is not turned into a pass", () => {
  const started = createTrainingSession(challenge, challenge.id, 1_000, alice);
  const passed = completeChallenge(started, challenge, 1_010);
  assert.equal(finishedAttemptSupersedes(passed, started), true);
  assert.equal(finishedAttemptSupersedes(passed, timeoutChallenge(started, challenge)), false);
});
