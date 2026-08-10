import type { TrainingEvent, WorkspaceEventName } from "./types.ts";

export type TrainingEventHandler = (event: TrainingEvent) => void | Promise<void>;

export interface TelemetrySink {
  record(event: TrainingEvent): void | Promise<void>;
}

export interface TrainingEventBus {
  publish(event: TrainingEvent): Promise<void>;
  subscribe(handler: TrainingEventHandler): () => void;
}

export class InProcessTrainingEventBus implements TrainingEventBus {
  private readonly handlers = new Set<TrainingEventHandler>();

  constructor(private readonly telemetrySinks: readonly TelemetrySink[] = []) {}

  async publish(event: TrainingEvent): Promise<void> {
    await Promise.all(this.telemetrySinks.map((sink) => sink.record(event)));
    await Promise.all([...this.handlers].map((handler) => handler(event)));
  }

  subscribe(handler: TrainingEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}

export interface CreateTrainingEventInput<P> {
  id: string;
  source: string;
  type: WorkspaceEventName;
  sessionId: string;
  payload: P;
  timestamp?: string;
}

export function createTrainingEvent<P>(input: CreateTrainingEventInput<P>): TrainingEvent<P> {
  return {
    id: input.id,
    source: input.source,
    type: input.type,
    timestamp: input.timestamp ?? new Date().toISOString(),
    sessionId: input.sessionId,
    payload: input.payload,
  };
}
