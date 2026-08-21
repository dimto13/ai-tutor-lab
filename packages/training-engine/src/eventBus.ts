import type { TrainingEvent, WorkspaceEventName } from "./types.ts";

export type TrainingEventHandler = (event: TrainingEvent) => void | Promise<void>;

export interface TelemetrySink {
  record(event: TrainingEvent): void | Promise<void>;
}

export interface TrainingEventBus {
  publish(event: TrainingEvent): Promise<void>;
  subscribe(handler: TrainingEventHandler): () => void;
}

/**
 * Transport boundary for canonical training events. Consumers depend on
 * TrainingEventBus only; transport implementations can therefore change
 * without leaking WebSocket, polling or in-process details into engine/UI code.
 */
export interface TrainingEventTransport {
  send(event: TrainingEvent): Promise<void>;
  subscribe(handler: TrainingEventHandler): () => void;
}

abstract class HandlerBackedTrainingEventTransport implements TrainingEventTransport {
  private readonly handlers = new Set<TrainingEventHandler>();

  protected async deliver(event: TrainingEvent): Promise<void> {
    await Promise.all([...this.handlers].map((handler) => handler(event)));
  }

  abstract send(event: TrainingEvent): Promise<void>;

  subscribe(handler: TrainingEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}

export class InProcessTrainingEventTransport extends HandlerBackedTrainingEventTransport {
  async send(event: TrainingEvent): Promise<void> {
    await this.deliver(event);
  }
}

/**
 * Deterministic remote-boundary simulation for contract tests and local wiring.
 * Events cross a serialization boundary before subscribers receive them, which
 * catches consumers that accidentally rely on object identity or transport internals.
 */
export class MockRemoteTrainingEventTransport extends HandlerBackedTrainingEventTransport {
  readonly outboundFrames: string[] = [];

  async send(event: TrainingEvent): Promise<void> {
    const frame = JSON.stringify(event);
    this.outboundFrames.push(frame);
    const decoded = JSON.parse(frame) as TrainingEvent;
    await this.deliver(decoded);
  }
}

export class TransportBackedTrainingEventBus implements TrainingEventBus {
  private readonly transport: TrainingEventTransport;
  private readonly telemetrySinks: readonly TelemetrySink[];

  constructor(transport: TrainingEventTransport, telemetrySinks: readonly TelemetrySink[] = []) {
    this.transport = transport;
    this.telemetrySinks = telemetrySinks;
  }

  async publish(event: TrainingEvent): Promise<void> {
    await Promise.all(this.telemetrySinks.map((sink) => sink.record(event)));
    await this.transport.send(event);
  }

  subscribe(handler: TrainingEventHandler): () => void {
    return this.transport.subscribe(handler);
  }
}

/**
 * Backwards-compatible default bus. Existing consumers keep their current API
 * while the concrete in-process transport is now replaceable at composition time.
 */
export class InProcessTrainingEventBus extends TransportBackedTrainingEventBus {
  constructor(telemetrySinks: readonly TelemetrySink[] = []) {
    super(new InProcessTrainingEventTransport(), telemetrySinks);
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
