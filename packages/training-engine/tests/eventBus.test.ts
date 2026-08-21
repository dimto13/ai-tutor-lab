import assert from "node:assert/strict";
import test from "node:test";
import {
  InProcessTrainingEventBus,
  InProcessTrainingEventTransport,
  MockRemoteTrainingEventTransport,
  TransportBackedTrainingEventBus,
  createTrainingEvent,
  type TelemetrySink,
  type TrainingEventBus,
  type TrainingEventTransport,
} from "../src/eventBus.ts";
import type { TrainingEvent } from "../src/types.ts";

class MemoryTelemetrySink implements TelemetrySink {
  readonly events: TrainingEvent[] = [];

  record(event: TrainingEvent): void {
    this.events.push(event);
  }
}

function subscribeWithoutKnowingTransport(bus: TrainingEventBus, seen: TrainingEvent[]): () => void {
  return bus.subscribe((event) => {
    seen.push(event);
  });
}

function canonicalEvent(): TrainingEvent {
  return createTrainingEvent({
    id: "event-1",
    source: "vscode-simulator",
    type: "file.created",
    sessionId: "session-1",
    payload: { filename: "hello.py" },
    timestamp: "2026-08-10T00:00:00.000Z",
  });
}

test("every canonical event reaches subscribers and the telemetry sink", async () => {
  const telemetry = new MemoryTelemetrySink();
  const bus = new InProcessTrainingEventBus([telemetry]);
  const seen: TrainingEvent[] = [];
  const unsubscribe = subscribeWithoutKnowingTransport(bus, seen);
  const event = canonicalEvent();

  await bus.publish(event);
  unsubscribe();

  assert.deepEqual(seen, [event]);
  assert.deepEqual(telemetry.events, [event]);
});

test("in-process and mock-remote transports are interchangeable behind TrainingEventBus", async () => {
  const transports: TrainingEventTransport[] = [
    new InProcessTrainingEventTransport(),
    new MockRemoteTrainingEventTransport(),
  ];

  for (const transport of transports) {
    const telemetry = new MemoryTelemetrySink();
    const bus: TrainingEventBus = new TransportBackedTrainingEventBus(transport, [telemetry]);
    const seen: TrainingEvent[] = [];
    const unsubscribe = subscribeWithoutKnowingTransport(bus, seen);
    const event = canonicalEvent();

    await bus.publish(event);
    unsubscribe();

    assert.deepEqual(seen, [event]);
    assert.deepEqual(telemetry.events, [event]);
  }
});

test("mock remote transport crosses a serialized boundary", async () => {
  const transport = new MockRemoteTrainingEventTransport();
  const bus: TrainingEventBus = new TransportBackedTrainingEventBus(transport);
  const seen: TrainingEvent[] = [];
  subscribeWithoutKnowingTransport(bus, seen);
  const event = canonicalEvent();

  await bus.publish(event);

  assert.equal(transport.outboundFrames.length, 1);
  assert.deepEqual(JSON.parse(transport.outboundFrames[0]!), event);
  assert.deepEqual(seen, [event]);
  assert.notEqual(seen[0], event);
});
