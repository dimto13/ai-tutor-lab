import assert from "node:assert/strict";
import test from "node:test";
import {
  TrainingStateUnavailableError,
  createTrainingSession,
} from "@ai-train-lab/training-engine";
import type { Scenario, TrainingStateKey } from "@ai-train-lab/training-engine";
import { createAmplifyTrainingStateRepositoryWithClient } from "../src/persistence/adapters/amplifyTrainingStateRepository.ts";

const scenario: Scenario = {
  id: "amplify-transport.guided",
  mode: "guided",
  title: "Amplify transport",
  description: "Amplify transport fixture",
  steps: [],
};

const key: TrainingStateKey = {
  subject: { userId: "alice", tenantId: "tenant-a" },
  scenarioId: scenario.id,
  mode: "guided",
};

type Client = Parameters<typeof createAmplifyTrainingStateRepositoryWithClient>[0];

function failingClient(error: Error): Client {
  const reject = async () => {
    throw error;
  };
  return {
    queries: {
      loadTrainingState: reject,
      loadRuntimeSnapshot: reject,
    },
    mutations: {
      saveTrainingState: reject,
      saveRuntimeSnapshot: reject,
      deleteRuntimeSnapshot: reject,
    },
  } as unknown as Client;
}

test("classifies fetch/network failures as temporary repository unavailability", async () => {
  const repository = createAmplifyTrainingStateRepositoryWithClient(
    failingClient(new TypeError("Failed to fetch")),
  );

  await assert.rejects(repository.loadSession(key), (error: unknown) => {
    assert.ok(error instanceof TrainingStateUnavailableError);
    assert.ok(error.originalError instanceof TypeError);
    return true;
  });
});

test("does not classify authentication or application errors as offline transport failures", async () => {
  const authError = new Error("No current user");
  const repository = createAmplifyTrainingStateRepositoryWithClient(failingClient(authError));

  await assert.rejects(repository.loadSession(key), (error: unknown) => {
    assert.equal(error, authError);
    assert.ok(!(error instanceof TrainingStateUnavailableError));
    return true;
  });
});

test("transport classification also applies to writes", async () => {
  const repository = createAmplifyTrainingStateRepositoryWithClient(
    failingClient(new Error("Network request failed")),
  );
  const session = createTrainingSession(scenario, scenario.id, 100, key.subject);

  await assert.rejects(
    repository.saveSession(key, session, { expectedRevision: null }),
    TrainingStateUnavailableError,
  );
});
