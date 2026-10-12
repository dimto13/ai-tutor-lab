import type { TrainingSubjectRef } from "@ai-train-lab/training-engine";
import { createAmplifyTrainingStateRepositoryWithClient } from "../src/persistence/adapters/amplifyTrainingStateRepository.ts";
import { defineTrainingStateRepositoryContract } from "./trainingStateRepository.contract.ts";

interface StoredValue {
  userId: string;
  tenantId: string;
  schemaVersion: number;
  revision: number;
  updatedAt: number;
  payload: unknown;
  runtimeId?: string;
}

interface OperationArgs {
  scenarioId: string;
  mode: string;
  runtimeId?: string;
  schemaVersion?: number;
  expectedRevision?: number;
  payload?: unknown;
}

class FakeAmplifyTrainingStateBackend {
  readonly sessions = new Map<string, StoredValue>();
  readonly runtimes = new Map<string, StoredValue>();
  timestamp = 1_000;

  sessionKey(subject: TrainingSubjectRef, args: OperationArgs): string {
    return `${this.tenant(subject)}:${subject.userId}:${args.scenarioId}:${args.mode}`;
  }

  runtimeKey(subject: TrainingSubjectRef, args: OperationArgs): string {
    return `${this.sessionKey(subject, args)}:${args.runtimeId ?? ""}`;
  }

  tenant(subject: TrainingSubjectRef): string {
    return subject.tenantId ?? `personal:${subject.userId}`;
  }

  conflict() {
    return {
      data: null,
      errors: [
        {
          errorType: "ConditionalCheckFailedException",
          message: "The conditional request failed",
        },
      ],
    };
  }

  invalidJson() {
    return {
      data: null,
      errors: [{ message: "AWSJSON argument payload must be a JSON string" }],
    };
  }

  /**
   * `payload` is AWSJSON. AppSync carries it as a JSON string in both directions, exactly as the
   * cloud acceptance specs send and decode it; the resolver sees the parsed value. A fake that passed
   * objects through let the adapter ship without ever encoding or decoding it (#528, #545).
   */
  envelope(value: StoredValue) {
    return { ...structuredClone(value), payload: JSON.stringify(value.payload) };
  }

  save(
    store: Map<string, StoredValue>,
    storageKey: string,
    subject: TrainingSubjectRef,
    args: OperationArgs,
  ) {
    if (typeof args.payload !== "string") return this.invalidJson();
    const current = store.get(storageKey);
    const expectedRevision = args.expectedRevision ?? null;
    const actualRevision = current?.revision ?? null;
    if (expectedRevision !== actualRevision) return this.conflict();

    const value: StoredValue = {
      userId: subject.userId,
      tenantId: this.tenant(subject),
      schemaVersion: args.schemaVersion ?? 0,
      revision: (actualRevision ?? 0) + 1,
      updatedAt: this.timestamp++,
      payload: JSON.parse(args.payload) as unknown,
      ...(args.runtimeId ? { runtimeId: args.runtimeId } : {}),
    };
    store.set(storageKey, value);
    return { data: this.envelope(value), errors: undefined };
  }

  load(store: Map<string, StoredValue>, storageKey: string) {
    const value = store.get(storageKey);
    return { data: value ? this.envelope(value) : null, errors: undefined };
  }

  deleteRuntime(subject: TrainingSubjectRef, args: OperationArgs) {
    const storageKey = this.runtimeKey(subject, args);
    const current = this.runtimes.get(storageKey);
    const expectedRevision = args.expectedRevision ?? null;
    const actualRevision = current?.revision ?? null;
    if (expectedRevision !== actualRevision) return this.conflict();

    this.runtimes.delete(storageKey);
    return { data: true, errors: undefined };
  }

  clientFor(subject: TrainingSubjectRef): unknown {
    return {
      queries: {
        loadTrainingState: async (args: OperationArgs) =>
          this.load(this.sessions, this.sessionKey(subject, args)),
        loadRuntimeSnapshot: async (args: OperationArgs) =>
          this.load(this.runtimes, this.runtimeKey(subject, args)),
      },
      mutations: {
        saveTrainingState: async (args: OperationArgs) =>
          this.save(this.sessions, this.sessionKey(subject, args), subject, args),
        saveRuntimeSnapshot: async (args: OperationArgs) =>
          this.save(this.runtimes, this.runtimeKey(subject, args), subject, args),
        deleteRuntimeSnapshot: async (args: OperationArgs) => this.deleteRuntime(subject, args),
      },
    };
  }
}

defineTrainingStateRepositoryContract("AmplifyTrainingStateRepository", () => {
  const backend = new FakeAmplifyTrainingStateBackend();
  return {
    repositoryFor(subject) {
      type Client = Parameters<typeof createAmplifyTrainingStateRepositoryWithClient>[0];
      return createAmplifyTrainingStateRepositoryWithClient(backend.clientFor(subject) as Client);
    },
  };
});
