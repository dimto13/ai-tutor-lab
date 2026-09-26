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

/**
 * Transport classification decides whether a failed write may be buffered as a pending offline
 * write (#8/AITP-14) or has to surface as a hard application error. Only conditions that a later
 * retry can plausibly resolve belong here; authorization, validation and schema failures must stay
 * hard errors so they cannot hide behind an offline outbox.
 */
const TRANSIENT_ERROR_NAMES = new Set(["NetworkError", "AbortError", "TimeoutError"]);

const TRANSIENT_TRANSPORT_PATTERNS: readonly RegExp[] = [
  /^(Failed to fetch|fetch failed|Network request failed|Load failed)$/i,
  /NetworkError when attempting to fetch resource/i,
  /\bnetwork (error|failure|request failed|connection was lost)\b/i,
  /\bThe Internet connection appears to be offline\b/i,
  /\bERR_NETWORK\b|\bERR_INTERNET_DISCONNECTED\b|\bERR_NAME_NOT_RESOLVED\b|\bERR_CONNECTION_[A-Z_]+\b|net::ERR_/,
  /\bECONNRESET\b|\bECONNREFUSED\b|\bENOTFOUND\b|\bEAI_AGAIN\b|\bETIMEDOUT\b|\bEPIPE\b/,
  /\bsocket hang up\b/i,
  /\btimed out\b|\btimeout\b/i,
];

/**
 * Server-side conditions that AppSync reports as GraphQL errors although the request itself was
 * accepted and may succeed unchanged on a later attempt.
 */
const TRANSIENT_OPERATION_PATTERNS: readonly RegExp[] = [
  /ServiceUnavailable|ServiceQuotaExceeded|InternalFailure|InternalServerError|Internal Server Error/i,
  /Throttl|TooManyRequests|RequestLimitExceeded|ProvisionedThroughputExceeded/i,
  /RequestTimeout|ExecutionTimeout|TimeoutException|TransactionInProgress/i,
  /\b(502|503|504)\b/,
];

function isTransientMessage(message: string, patterns: readonly RegExp[]): boolean {
  const normalized = message.trim();
  if (normalized.length === 0) return false;
  return patterns.some((pattern) => pattern.test(normalized));
}

function isTransientOperationFailure(errors: unknown): boolean {
  if (!Array.isArray(errors) || errors.length === 0) return false;
  return isTransientMessage(errorText(errors), TRANSIENT_OPERATION_PATTERNS);
}

function isTransientTransportFailure(error: unknown): boolean {
  if (error instanceof Error) {
    if (TRANSIENT_ERROR_NAMES.has(error.name)) return true;
    return isTransientMessage(error.message, TRANSIENT_TRANSPORT_PATTERNS);
  }
  if (typeof error === "object" && error !== null) {
    const errors = Reflect.get(error, "errors");
    if (Array.isArray(errors)) {
      return (
        isTransientOperationFailure(errors) ||
        isTransientMessage(errorText(errors), TRANSIENT_TRANSPORT_PATTERNS)
      );
    }
    const message = Reflect.get(error, "message");
    if (typeof message === "string") {
      return isTransientMessage(message, TRANSIENT_TRANSPORT_PATTERNS);
    }
  }
  return false;
}

/** Amplify can reject with plain objects; downstream code expects an `Error`. */
function asError(cause: unknown): Error {
  if (cause instanceof Error) return cause;
  if (typeof cause === "object" && cause !== null) {
    const errors = Reflect.get(cause, "errors");
    if (Array.isArray(errors)) return new Error(errorText(errors));
    const message = Reflect.get(cause, "message");
    if (typeof message === "string" && message.length > 0) return new Error(message);
  }
  return new Error(typeof cause === "string" ? cause : "Unknown Amplify Data error");
}

export interface AmplifyTrainingStateTransportPolicy {
  /** Total attempts per operation for transient failures. */
  readonly attempts: number;
  /** Per-attempt time budget; `null` disables the timeout. */
  readonly timeoutMs: number | null;
  readonly delayMs: (attempt: number) => number;
  readonly sleep: (ms: number) => Promise<void>;
}

const defaultTransportPolicy: AmplifyTrainingStateTransportPolicy = {
  attempts: 3,
  timeoutMs: 12_000,
  delayMs: (attempt) => 250 * attempt,
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
};

function timeoutError(timeoutMs: number): Error {
  const error = new Error(`Amplify Data operation timed out after ${timeoutMs}ms`);
  error.name = "TimeoutError";
  return error;
}

async function withTimeout<T>(
  policy: AmplifyTrainingStateTransportPolicy,
  operation: () => Promise<T>,
): Promise<T> {
  const timeoutMs = policy.timeoutMs;
  if (timeoutMs === null) return operation();

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(timeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Runs one Amplify Data operation with a bounded retry for transient failures.
 *
 * Retrying a write is safe because every write is guarded by `expectedRevision`: a write that
 * landed but lost its response makes the retry fail the revision condition, which the caller
 * resolves against the persisted server authority instead of overwriting it.
 */
async function executeAmplifyOperation<T extends { errors?: unknown }>(
  policy: AmplifyTrainingStateTransportPolicy,
  operation: () => Promise<T>,
): Promise<T> {
  let unavailable: TrainingStateUnavailableError | null = null;

  for (let attempt = 1; attempt <= policy.attempts; attempt += 1) {
    try {
      const result = await withTimeout(policy, operation);
      if (!isTransientOperationFailure(result.errors)) return result;
      unavailable = new TrainingStateUnavailableError(new Error(errorText(result.errors)));
    } catch (error) {
      if (!isTransientTransportFailure(error)) throw asError(error);
      unavailable = new TrainingStateUnavailableError(error);
    }

    if (attempt < policy.attempts) await policy.sleep(policy.delayMs(attempt));
  }

  throw unavailable ?? new TrainingStateUnavailableError();
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
  transportPolicy: Partial<AmplifyTrainingStateTransportPolicy> = {},
): TrainingStateRepository {
  const policy: AmplifyTrainingStateTransportPolicy = {
    ...defaultTransportPolicy,
    ...transportPolicy,
  };
  type SaveSessionArgs = Parameters<typeof client.mutations.saveTrainingState>[0];
  type SaveRuntimeArgs = Parameters<typeof client.mutations.saveRuntimeSnapshot>[0];
  type DeleteRuntimeArgs = Parameters<typeof client.mutations.deleteRuntimeSnapshot>[0];

  const repository: TrainingStateRepository = {
    async loadSession(key) {
      const result = await executeAmplifyOperation(policy, () =>
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
      const result = await executeAmplifyOperation(policy, () =>
        client.mutations.saveTrainingState(args),
      );
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
      const result = await executeAmplifyOperation(policy, () =>
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
      const result = await executeAmplifyOperation(policy, () =>
        client.mutations.saveRuntimeSnapshot(args),
      );
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
      const result = await executeAmplifyOperation(policy, () =>
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
