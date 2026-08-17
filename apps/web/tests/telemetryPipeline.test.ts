import assert from "node:assert/strict";
import test from "node:test";
import type { TelemetrySink, TrainingEvent, TrainingSession } from "@ai-train-lab/training-engine";
import {
  BufferedTelemetrySink,
  TelemetryDeliveryError,
  TrainingTelemetryRecorder,
  learningTelemetryEventType,
  type RetryScheduler,
  type TelemetryEventWriter,
  type TelemetryOutbox,
} from "../src/telemetry/telemetryPipeline.ts";

class MemoryOutbox implements TelemetryOutbox {
  events: TrainingEvent[] = [];
  deadLetters: Array<{ event: TrainingEvent; reason: string }> = [];

  load(): TrainingEvent[] {
    return [...this.events];
  }

  save(events: readonly TrainingEvent[]): void {
    this.events = [...events];
  }

  deadLetter(event: TrainingEvent, reason: string): void {
    this.deadLetters.push({ event, reason });
  }
}

function event(id: string): TrainingEvent {
  return {
    id,
    source: "learning-analytics",
    type: "analytics.session.started",
    timestamp: "2026-08-17T18:00:00.000Z",
    sessionId: "scenario:1",
    payload: { scenarioId: "scenario", mode: "guided" },
  };
}

test("BufferedTelemetrySink keeps events durable and retries with deterministic delays", async () => {
  const outbox = new MemoryOutbox();
  const delays: number[] = [];
  let attempts = 0;
  const writer: TelemetryEventWriter = {
    async write() {
      attempts += 1;
      if (attempts < 3) throw new Error("offline");
    },
  };
  const scheduler: RetryScheduler = {
    async sleep(delayMs) {
      delays.push(delayMs);
    },
  };
  const sink = new BufferedTelemetrySink(outbox, writer, [10, 20, 30], scheduler);

  sink.record(event("event-1"));
  assert.equal(outbox.events.length, 1, "record must persist before delivery finishes");
  await sink.flush();

  assert.equal(attempts, 3);
  assert.deepEqual(delays, [10, 20]);
  assert.deepEqual(outbox.events, []);
});

test("BufferedTelemetrySink never drops an event after retry exhaustion", async () => {
  const outbox = new MemoryOutbox();
  const delays: number[] = [];
  const writer: TelemetryEventWriter = {
    async write() {
      throw new Error("still offline");
    },
  };
  const scheduler: RetryScheduler = {
    async sleep(delayMs) {
      delays.push(delayMs);
    },
  };
  const sink = new BufferedTelemetrySink(outbox, writer, [5, 15], scheduler);

  sink.record(event("event-2"));
  await sink.flush();

  assert.deepEqual(delays, [5, 15]);
  assert.deepEqual(
    outbox.events.map((queued) => queued.id),
    ["event-2"],
  );
  assert.deepEqual(outbox.deadLetters, []);
});

test("BufferedTelemetrySink quarantines permanent rejects without blocking later events", async () => {
  const outbox = new MemoryOutbox();
  const delivered: string[] = [];
  const writer: TelemetryEventWriter = {
    async write(candidate) {
      if (candidate.id === "invalid") {
        throw new TelemetryDeliveryError("server validation rejected event", false);
      }
      delivered.push(candidate.id);
    },
  };
  const sink = new BufferedTelemetrySink(outbox, writer, [5, 15], {
    async sleep() {
      assert.fail("permanent rejects must not be retried");
    },
  });

  outbox.save([event("invalid"), event("valid")]);
  await sink.flush();

  assert.deepEqual(delivered, ["valid"]);
  assert.deepEqual(outbox.events, []);
  assert.deepEqual(
    outbox.deadLetters.map((record) => record.event.id),
    ["invalid"],
  );
});

test("BufferedTelemetrySink preserves events recorded while a flush is in flight", async () => {
  const outbox = new MemoryOutbox();
  const delivered: string[] = [];
  let releaseFirst!: () => void;
  let markFirstStarted!: () => void;
  const firstBlocked = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const firstStarted = new Promise<void>((resolve) => {
    markFirstStarted = resolve;
  });
  const writer: TelemetryEventWriter = {
    async write(candidate) {
      delivered.push(candidate.id);
      if (candidate.id === "event-1") {
        markFirstStarted();
        await firstBlocked;
      }
    },
  };
  const sink = new BufferedTelemetrySink(outbox, writer, [], {
    async sleep() {
      assert.fail("no retry expected");
    },
  });

  sink.record(event("event-1"));
  await firstStarted;
  sink.record(event("event-2"));
  assert.deepEqual(
    outbox.events.map((queued) => queued.id),
    ["event-1", "event-2"],
  );

  releaseFirst();
  await sink.flush();

  assert.deepEqual(delivered, ["event-1", "event-2"]);
  assert.deepEqual(outbox.events, []);
});

function session(overrides: Partial<TrainingSession> = {}): TrainingSession {
  return {
    id: "scenario-a",
    scenarioId: "scenario-a",
    subject: { userId: "user-secret", tenantId: "tenant-secret" },
    mode: "guided",
    statuses: { stepA: "ACTIVE", stepB: "NOT_STARTED" },
    activeStepId: "stepA",
    startedAt: 1_000,
    finishedAt: null,
    challengeOutcome: null,
    hintsUsed: 0,
    hintUsage: [],
    mistakes: 0,
    activeStepMistakes: 0,
    attempts: [],
    lastAction: null,
    exploredTargets: [],
    lastInspectedRef: null,
    ...overrides,
  };
}

test("TrainingTelemetryRecorder reuses TrainingEvent without leaking subject identity", async () => {
  const events: TrainingEvent[] = [];
  const sink: TelemetrySink = {
    record(recorded) {
      events.push(recorded);
    },
  };
  const recorder = new TrainingTelemetryRecorder(sink);

  const initial = session();
  recorder.recordSession(initial, 1_000);
  recorder.recordSession(
    session({
      statuses: { stepA: "VALIDATION_FAILED", stepB: "NOT_STARTED" },
      hintsUsed: 1,
      hintUsage: [{ stepId: "stepA", level: 1, timestamp: 1_200 }],
      mistakes: 1,
      activeStepMistakes: 1,
      attempts: [{ id: "attempt-1", stepId: "stepA", outcome: "near-miss", timestamp: 1_300 }],
      lastAction: "file.updated",
    }),
    1_400,
  );
  recorder.recordSession(
    session({
      statuses: { stepA: "COMPLETED", stepB: "ACTIVE" },
      activeStepId: "stepB",
      hintsUsed: 1,
      hintUsage: [{ stepId: "stepA", level: 1, timestamp: 1_200 }],
      mistakes: 1,
      attempts: [
        { id: "attempt-1", stepId: "stepA", outcome: "near-miss", timestamp: 1_300 },
        { id: "attempt-2", stepId: "stepA", outcome: "pass", timestamp: 1_500 },
      ],
      lastAction: "file.updated",
    }),
    1_600,
  );
  recorder.recordSession(
    session({
      statuses: { stepA: "COMPLETED", stepB: "COMPLETED" },
      activeStepId: null,
      finishedAt: 2_500,
      hintsUsed: 1,
      hintUsage: [{ stepId: "stepA", level: 1, timestamp: 1_200 }],
      mistakes: 1,
      attempts: [
        { id: "attempt-1", stepId: "stepA", outcome: "near-miss", timestamp: 1_300 },
        { id: "attempt-2", stepId: "stepA", outcome: "pass", timestamp: 1_500 },
      ],
      lastAction: "file.updated",
    }),
    2_500,
  );

  await Promise.resolve();
  assert.ok(events.some((value) => value.type === learningTelemetryEventType.hintUsed));
  assert.ok(events.some((value) => value.type === learningTelemetryEventType.attemptRecorded));
  assert.ok(events.some((value) => value.type === learningTelemetryEventType.stepCompleted));
  assert.ok(events.some((value) => value.type === learningTelemetryEventType.sessionCompleted));
  assert.ok(events.every((value) => value.sessionId === "scenario-a:1000"));
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes("user-secret"), false);
  assert.equal(serialized.includes("tenant-secret"), false);

  const firstStepCompletion = events.find(
    (value) =>
      value.type === learningTelemetryEventType.stepCompleted &&
      (value.payload as { stepId?: string }).stepId === "stepA",
  );
  assert.equal((firstStepCompletion?.payload as { durationMs?: number }).durationMs, 600);
});
