import assert from "node:assert/strict";
import test from "node:test";
import {
  TrainingStateConflictError,
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

function countingClient(results: readonly (Error | { data?: unknown; errors?: unknown })[]): {
  client: Client;
  calls: () => number;
} {
  let call = 0;
  const respond = async () => {
    const outcome = results[Math.min(call, results.length - 1)];
    call += 1;
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  const client = {
    queries: { loadTrainingState: respond, loadRuntimeSnapshot: respond },
    mutations: {
      saveTrainingState: respond,
      saveRuntimeSnapshot: respond,
      deleteRuntimeSnapshot: respond,
    },
  } as unknown as Client;
  return { client, calls: () => call };
}

const immediateRetries = {
  attempts: 3,
  timeoutMs: null,
  delayMs: () => 0,
  sleep: async () => undefined,
} as const;

const noRetries = { ...immediateRetries, attempts: 1 } as const;

const persistedRecord = {
  data: {
    userId: "alice",
    tenantId: "tenant-a",
    scenarioId: scenario.id,
    mode: "guided",
    schemaVersion: 1,
    revision: 4,
    updatedAt: 1_700_000_000_000,
    payload: { scenarioId: scenario.id },
  },
};

test("browser-specific offline messages are buffered instead of failing the completion", async () => {
  for (const message of [
    "NetworkError when attempting to fetch resource.",
    "The network connection was lost.",
    "Load failed",
    "net::ERR_INTERNET_DISCONNECTED",
    "connect ECONNRESET 10.0.0.1:443",
    "socket hang up",
  ]) {
    const repository = createAmplifyTrainingStateRepositoryWithClient(
      countingClient([new Error(message)]).client,
      noRetries,
    );
    await assert.rejects(
      repository.loadSession(key),
      TrainingStateUnavailableError,
      `"${message}" must classify as temporary unavailability`,
    );
  }
});

test("transient AppSync errors classify as unavailability so a completion can be buffered", async () => {
  for (const errorType of [
    "ServiceUnavailable",
    "InternalFailure",
    "ThrottlingException",
    "Lambda:ExecutionTimeoutException",
    "ProvisionedThroughputExceededException",
  ]) {
    const repository = createAmplifyTrainingStateRepositoryWithClient(
      countingClient([{ errors: [{ errorType, message: "upstream failed" }] }]).client,
      noRetries,
    );
    const session = createTrainingSession(scenario, scenario.id, 100, key.subject);
    await assert.rejects(
      repository.saveSession(key, session, { expectedRevision: null }),
      TrainingStateUnavailableError,
      `${errorType} must not surface as a permanent write failure`,
    );
  }
});

test("authorization and validation errors stay hard failures and are never retried", async () => {
  for (const errorType of ["Unauthorized", "ValidationException", "TenantMembershipError"]) {
    const counting = countingClient([{ errors: [{ errorType, message: "denied" }] }]);
    const repository = createAmplifyTrainingStateRepositoryWithClient(
      counting.client,
      immediateRetries,
    );
    await assert.rejects(repository.loadSession(key), (error: unknown) => {
      assert.ok(!(error instanceof TrainingStateUnavailableError), `${errorType} must be hard`);
      return true;
    });
    assert.equal(counting.calls(), 1, `${errorType} must not be retried`);
  }
});

test("a transient failure is retried and the recovered attempt wins", async () => {
  const counting = countingClient([new Error("Failed to fetch"), persistedRecord]);
  const repository = createAmplifyTrainingStateRepositoryWithClient(
    counting.client,
    immediateRetries,
  );

  const record = await repository.loadSession(key);
  assert.equal(record?.revision, 4);
  assert.equal(counting.calls(), 2);
});

test("retries are bounded and end in temporary unavailability", async () => {
  const counting = countingClient([new Error("Failed to fetch")]);
  const repository = createAmplifyTrainingStateRepositoryWithClient(
    counting.client,
    immediateRetries,
  );

  await assert.rejects(repository.loadSession(key), TrainingStateUnavailableError);
  assert.equal(counting.calls(), 3);
});

test("a hanging request becomes temporary unavailability instead of an endless spinner", async () => {
  const hanging = {
    queries: {
      loadTrainingState: () => new Promise(() => undefined),
      loadRuntimeSnapshot: () => new Promise(() => undefined),
    },
    mutations: {
      saveTrainingState: () => new Promise(() => undefined),
      saveRuntimeSnapshot: () => new Promise(() => undefined),
      deleteRuntimeSnapshot: () => new Promise(() => undefined),
    },
  } as unknown as Client;
  const repository = createAmplifyTrainingStateRepositoryWithClient(hanging, {
    attempts: 1,
    timeoutMs: 5,
    delayMs: () => 0,
    sleep: async () => undefined,
  });

  await assert.rejects(repository.loadSession(key), (error: unknown) => {
    assert.ok(error instanceof TrainingStateUnavailableError);
    assert.match(String((error.originalError as Error).message), /timed out/);
    return true;
  });
});

test("revision conflicts keep their own signal and are not softened into unavailability", async () => {
  const conflict = {
    errors: [{ errorType: "DynamoDB:ConditionalCheckFailedException", message: "conditional" }],
  };
  let call = 0;
  const client = {
    queries: {
      loadTrainingState: async () => persistedRecord,
      loadRuntimeSnapshot: async () => ({ data: null }),
    },
    mutations: {
      saveTrainingState: async () => {
        call += 1;
        return conflict;
      },
      saveRuntimeSnapshot: async () => conflict,
      deleteRuntimeSnapshot: async () => conflict,
    },
  } as unknown as Client;
  const repository = createAmplifyTrainingStateRepositoryWithClient(client, immediateRetries);
  const session = createTrainingSession(scenario, scenario.id, 100, key.subject);

  await assert.rejects(
    repository.saveSession(key, session, { expectedRevision: 3 }),
    (error: unknown) => {
      assert.ok(error instanceof TrainingStateConflictError);
      assert.equal(error.expectedRevision, 3);
      assert.equal(error.actualRevision, 4);
      return true;
    },
  );
  assert.equal(call, 1, "a conflict is authoritative and must not be retried");
});
