import assert from "node:assert/strict";
import test from "node:test";
import { InProcessTrainingEventBus, createTrainingEvent } from "../src/eventBus.ts";
import type { TelemetrySink } from "../src/eventBus.ts";
import type { TrainingEvent } from "../src/types.ts";

class MemoryTelemetrySink implements TelemetrySink {
  readonly events: TrainingEvent[] = [];

  record(event: TrainingEvent): void {
    this.events.push(event);
  }
}

test("every canonical event reaches subscribers and the telemetry sink", async () => {
  const telemetry = new MemoryTelemetrySink();
  const bus = new InProcessTrainingEventBus([telemetry]);
  const seen: TrainingEvent[] = [];
  const unsubscribe = bus.subscribe((event) => seen.push(event));
  const event = createTrainingEvent({
    id: "event-1",
    source: "vscode-simulator",
    type: "file.created",
    sessionId: "session-1",
    payload: { filename: "hello.py" },
    timestamp: "2026-08-10T00:00:00.000Z",
  });

  await bus.publish(event);
  unsubscribe();

  assert.deepEqual(seen, [event]);
  assert.deepEqual(telemetry.events, [event]);
});
