import { generateClient } from "aws-amplify/data";
import {
  TRAINING_STATE_SCHEMA_VERSION,
  TrainingStateConflictError,
  TrainingStateUnavailableError,
  sameTrainingSubject,
} from "@ai-train-lab/training-engine";
import type {
  StoredTrainingSession,
  TrainingSession,
  TrainingStateKey,
  TrainingStateRecord,
  TrainingStateRepository,
} from "@ai-train-lab/training-engine";
import type { Schema } from "../../../../../amplify/data/resource";

function errorText(errors: unknown): string {
  if (!Array.isArray(errors)) return "Unknown Amplify Data error";
  const messages = errors
    .map((error) => {
      if (typeof error !== "object" || error === null) return String(error);
      const message = Reflect.get(error, "message");
      const errorType = Reflect.get(error, "errorType");
      return [errorType, message].filter((value) => typeof value === "string").join(": ");
    })
    .filter(Boolean);
  return messages.join("; ") || "Unknown Amplify Data error";
}

function isRevisionConflict(errors: unknown): boolean {
  return /ConditionalCheckFailed|conditional request failed/i.test(errorText(errors));
}

function isTransportUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "NetworkError") return true;
  const message = error.message.trim();
  return (
    /^(Failed to fetch|fetch failed|Network request failed|Load failed)$/i.test(message) ||
    /\bERR_NETWORK\b/.test(message)
  );
}

async function executeAmplifyOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isTransportUnavailable(error)) throw new TrainingStateUnavailableError(error);
    throw error;
  }
}

function assertServerIdentity(key: TrainingStateKey, userId: unknown, tenantId: unknown): void {
  if (typeof userId !== "string" || userId !== key.subject.userId) {
    throw new Error("Persisted training state belongs to a different authenticated user");
  }
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    throw new Error("Persisted training state has no authoritative tenant");
  }
  if (key.subject.tenantId !== null && tenantId !== key.subject.tenantId) {
    throw new Error("Persisted training state belongs to a different tenant");
  }
}

function assertSessionMatchesKey(key: TrainingStateKey, session: TrainingSession): void {
  if (
    session.scenarioId !== key.scenarioId ||
    session.mode !== key.mode ||
    !sameTrainingSubject(session.subject, key.subject)
  ) {
    throw new Error("Training session does not match persistence key");
  }
}

function sessionRecord(
  key: TrainingStateKey,
  data: {
    userId?: unknown;
    tenantId?: unknown;
    schemaVersion?: unknown;
    revision?: unknown;
    updatedAt?: unknown;
    payload?: unknown;
  },
): TrainingStateRecord<StoredTrainingSession> {
  assertServerIdentity(key, data.userId, data.tenantId);
  if (data.schemaVersion !== TRAINING_STATE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported remote training state schema version: ${String(data.schemaVersion)}`,
    );
  }
  if (typeof data.revision !== "number" || !Number.isInteger(data.revision) || data.revision < 1) {
    throw new Error("Remote training state has an invalid revision");
  }
  if (typeof data.updatedAt !== "number" || !Number.isFinite(data.updatedAt)) {
    throw new Error("Remote training state has an invalid timestamp");
  }

  return {
    schemaVersion: TRAINING_STATE_SCHEMA_VERSION,
    key,
    revision: data.revision,
    updatedAt: data.updatedAt,
    value: data.payload as StoredTrainingSession,
  };
}

function runtimeRecord(
  key: TrainingStateKey,
  data: {
    userId?: unknown;
    tenantId?: unknown;
    runtimeId?: unknown;
    schemaVersion?: unknown;
    revision?: unknown;
    updatedAt?: unknown;
    payload?: unknown;
  },
  runtimeId: string,
): TrainingStateRecord<unknown> {
  assertServerIdentity(key, data.userId, data.tenantId);
  if (data.runtimeId !== runtimeId) throw new Error("Remote runtime snapshot id mismatch");
  if (data.schemaVersion !== TRAINING_STATE_SCHEMA_VERSION) {
    throw new Error(`Unsupported remote runtime schema version: ${String(data.schemaVersion)}`);
  }
  if (typeof data.revision !== "number" || !Number.isInteger(data.revision) || data.revision < 1) {
    throw new Error("Remote runtime snapshot has an invalid revision");
  }
  if (typeof data.updatedAt !== "number" || !Number.isFinite(data.updatedAt)) {
    throw new Error("Remote runtime snapshot has an invalid timestamp");
  }

  return {
    schemaVersion: TRAINING_STATE_SCHEMA_VERSION,
    key,
    revision: data.revision,
    updatedAt: data.updatedAt,
    value: data.payload,
  };
}

type AmplifyTrainingStateClient = ReturnType<typeof generateClient<Schema>>;

export function createAmplifyTrainingStateRepositoryWithClient(
  client: AmplifyTrainingStateClient,
): TrainingStateRepository {
  type SaveSessionArgs = Parameters<typeof client.mutations.saveTrainingState>[0];
  type SaveRuntimeArgs = Parameters<typeof client.mutations.saveRuntimeSnapshot>[0];
  type DeleteRuntimeArgs = Parameters<typeof client.mutations.deleteRuntimeSnapshot>[0];

  const repository: TrainingStateRepository = {
    async loadSession(key) {
      const result = await executeAmplifyOperation(() =>
        client.queries.loadTrainingState({
          scenarioId: key.scenarioId,
          mode: key.mode,
        }),
      );
      if (result.errors?.length) throw new Error(errorText(result.errors));
      if (!result.data) return null;
      return sessionRecord(key, result.data);
    },

    async saveSession(key, session, options) {
      assertSessionMatchesKey(key, session);
      const args: SaveSessionArgs = {
        scenarioId: key.scenarioId,
        mode: key.mode,
        schemaVersion: TRAINING_STATE_SCHEMA_VERSION,
        payload: session as SaveSessionArgs["payload"],
        ...(options.expectedRevision === null
          ? {}
          : { expectedRevision: options.expectedRevision }),
      };
      const result = await executeAmplifyOperation(() => client.mutations.saveTrainingState(args));
      if (result.errors?.length) {
        if (isRevisionConflict(result.errors)) {
          const current = await repository.loadSession(key);
          throw new TrainingStateConflictError(options.expectedRevision, current?.revision ?? null);
        }
        throw new Error(errorText(result.errors));
      }
      if (!result.data) throw new Error("Amplify Data returned no training state after save");
      return sessionRecord(key, result.data);
    },

    async loadRuntimeSnapshot(key, runtimeId) {
      const result = await executeAmplifyOperation(() =>
        client.queries.loadRuntimeSnapshot({
          scenarioId: key.scenarioId,
          mode: key.mode,
          runtimeId,
        }),
      );
      if (result.errors?.length) throw new Error(errorText(result.errors));
      if (!result.data) return null;
      return runtimeRecord(key, result.data, runtimeId);
    },

    async saveRuntimeSnapshot(key, runtimeId, snapshot, options) {
      const args: SaveRuntimeArgs = {
        scenarioId: key.scenarioId,
        mode: key.mode,
        runtimeId,
        schemaVersion: TRAINING_STATE_SCHEMA_VERSION,
        payload: snapshot as SaveRuntimeArgs["payload"],
        ...(options.expectedRevision === null
          ? {}
          : { expectedRevision: options.expectedRevision }),
      };
      const result = await executeAmplifyOperation(() => client.mutations.saveRuntimeSnapshot(args));
      if (result.errors?.length) {
        if (isRevisionConflict(result.errors)) {
          const current = await repository.loadRuntimeSnapshot(key, runtimeId);
          throw new TrainingStateConflictError(options.expectedRevision, current?.revision ?? null);
        }
        throw new Error(errorText(result.errors));
      }
      if (!result.data) throw new Error("Amplify Data returned no runtime snapshot after save");
      return runtimeRecord(key, result.data, runtimeId);
    },

    async deleteRuntimeSnapshot(key, runtimeId, options) {
      const args: DeleteRuntimeArgs = {
        scenarioId: key.scenarioId,
        mode: key.mode,
        runtimeId,
        ...(options.expectedRevision === null
          ? {}
          : { expectedRevision: options.expectedRevision }),
      };
      const result = await executeAmplifyOperation(() =>
        client.mutations.deleteRuntimeSnapshot(args),
      );
      if (result.errors?.length) {
        if (isRevisionConflict(result.errors)) {
          const current = await repository.loadRuntimeSnapshot(key, runtimeId);
          throw new TrainingStateConflictError(options.expectedRevision, current?.revision ?? null);
        }
        throw new Error(errorText(result.errors));
      }
      if (result.data !== true) throw new Error("Amplify Data did not confirm runtime deletion");
    },
  };

  return repository;
}

export function createAmplifyTrainingStateRepository(): TrainingStateRepository {
  return createAmplifyTrainingStateRepositoryWithClient(generateClient<Schema>());
}
