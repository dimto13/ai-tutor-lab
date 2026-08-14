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

  save(
    store: Map<string, StoredValue>,
    storageKey: string,
    subject: TrainingSubjectRef,
    args: OperationArgs,
  ) {
    const current = store.get(storageKey);
    const expectedRevision = args.expectedRevision ?? null;
    const actualRevision = current?.revision ?? null;
    if (expectedRevision !== actualRevision) {
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

    const value: StoredValue = {
      userId: subject.userId,
      tenantId: this.tenant(subject),
      schemaVersion: args.schemaVersion ?? 0,
      revision: (actualRevision ?? 0) + 1,
      updatedAt: this.timestamp++,
      payload: structuredClone(args.payload),
      ...(args.runtimeId ? { runtimeId: args.runtimeId } : {}),
    };
    store.set(storageKey, value);
    return { data: structuredClone(value), errors: undefined };
  }

  clientFor(subject: TrainingSubjectRef): unknown {
    return {
      queries: {
        loadTrainingState: async (args: OperationArgs) => ({
          data: structuredClone(this.sessions.get(this.sessionKey(subject, args)) ?? null),
          errors: undefined,
        }),
        loadRuntimeSnapshot: async (args: OperationArgs) => ({
          data: structuredClone(this.runtimes.get(this.runtimeKey(subject, args)) ?? null),
          errors: undefined,
        }),
      },
      mutations: {
        saveTrainingState: async (args: OperationArgs) =>
          this.save(this.sessions, this.sessionKey(subject, args), subject, args),
        saveRuntimeSnapshot: async (args: OperationArgs) =>
          this.save(this.runtimes, this.runtimeKey(subject, args), subject, args),
        deleteRuntimeSnapshot: async (args: OperationArgs) => {
          this.runtimes.delete(this.runtimeKey(subject, args));
          return { data: true, errors: undefined };
        },
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
