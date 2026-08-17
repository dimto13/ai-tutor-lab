import {
  InProcessTrainingEventBus,
  type TelemetrySink,
  type TrainingEvent,
  type TrainingMode,
  type TrainingSession,
} from "@ai-train-lab/training-engine";

export const LEARNING_TELEMETRY_SOURCE = "learning-analytics";

export const learningTelemetryEventType = {
  sessionStarted: "analytics.session.started",
  stepStarted: "analytics.step.started",
  hintUsed: "analytics.hint.used",
  attemptRecorded: "analytics.attempt.recorded",
  stepCompleted: "analytics.step.completed",
  sessionCompleted: "analytics.session.completed",
} as const;

export type LearningTelemetryEventType =
  (typeof learningTelemetryEventType)[keyof typeof learningTelemetryEventType];

export interface TelemetryOutbox {
  load(): TrainingEvent[];
  save(events: readonly TrainingEvent[]): void;
  deadLetter(event: TrainingEvent, reason: string): void;
}

export interface TelemetryEventWriter {
  write(event: TrainingEvent): Promise<void>;
}

export interface RetryScheduler {
  sleep(delayMs: number): Promise<void>;
}

export class TelemetryDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "TelemetryDeliveryError";
  }
}

const defaultRetryScheduler: RetryScheduler = {
  sleep(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  },
};

/**
 * Durable TelemetrySink for the canonical TrainingEvent contract.
 *
 * record() writes to the local outbox before starting delivery. Delivery is ordered and an event
 * is removed only after remote acknowledgement. Temporary transport failures therefore cannot
 * discard events. Explicit permanent server rejections are moved to the durable dead-letter store
 * so one invalid event cannot block later valid events.
 */
export class BufferedTelemetrySink implements TelemetrySink {
  private flushPromise: Promise<void> | null = null;

  constructor(
    private readonly outbox: TelemetryOutbox,
    private readonly writer: TelemetryEventWriter,
    private readonly retryDelaysMs: readonly number[] = [250, 1_000, 5_000],
    private readonly scheduler: RetryScheduler = defaultRetryScheduler,
  ) {}

  record(event: TrainingEvent): void {
    const queued = this.outbox.load();
    if (!queued.some((candidate) => candidate.id === event.id)) {
      this.outbox.save([...queued, event]);
    }
    void this.flush();
  }

  flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.flushQueuedEvents().finally(() => {
      this.flushPromise = null;
    });
    return this.flushPromise;
  }

  private async flushQueuedEvents(): Promise<void> {
    while (true) {
      const event = this.outbox.load()[0];
      if (!event) return;

      let delivered = false;
      let deadLettered = false;
      for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt += 1) {
        try {
          await this.writer.write(event);
          delivered = true;
          break;
        } catch (error) {
          if (error instanceof TelemetryDeliveryError && !error.retryable) {
            this.outbox.deadLetter(event, error.message);
            this.outbox.save(this.outbox.load().filter((candidate) => candidate.id !== event.id));
            deadLettered = true;
            break;
          }
          const delay = this.retryDelaysMs[attempt];
          if (delay === undefined) break;
          await this.scheduler.sleep(delay);
        }
      }

      if (deadLettered) continue;
      if (!delivered) return;
      this.outbox.save(this.outbox.load().filter((candidate) => candidate.id !== event.id));
    }
  }
}

interface LearningEventPayload {
  scenarioId: string;
  mode: TrainingMode;
  stepId?: string;
  hintLevel?: number;
  outcome?: string;
  actionType?: string;
  durationMs?: number;
}

function eventTimestamp(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

function telemetrySessionId(session: TrainingSession): string {
  return `${session.id}:${session.startedAt}`;
}

function createLearningEvent(
  session: TrainingSession,
  type: LearningTelemetryEventType,
  eventKey: string,
  timestampMs: number,
  payload: LearningEventPayload,
): TrainingEvent<LearningEventPayload> {
  const sessionId = telemetrySessionId(session);
  return {
    id: `analytics:${sessionId}:${eventKey}`,
    source: LEARNING_TELEMETRY_SOURCE,
    type,
    timestamp: eventTimestamp(timestampMs),
    sessionId,
    payload,
  };
}

function hintKey(usage: TrainingSession["hintUsage"][number]): string {
  return `${usage.stepId}:${usage.timestamp}:${usage.level}`;
}

function isPristineSession(session: TrainingSession): boolean {
  return (
    session.finishedAt === null &&
    session.lastAction === null &&
    session.hintUsage.length === 0 &&
    session.attempts.length === 0 &&
    session.mistakes === 0
  );
}

/**
 * Observes already-authoritative TrainingSession transitions and emits only privacy-minimised
 * learning signals as canonical TrainingEvents. No user or tenant identity is copied into payloads.
 */
export class TrainingTelemetryRecorder {
  private readonly bus: InProcessTrainingEventBus;
  private readonly previousSessions = new Map<string, TrainingSession>();
  private readonly stepStartedAt = new Map<string, number>();

  constructor(sink: TelemetrySink) {
    this.bus = new InProcessTrainingEventBus([sink]);
  }

  recordSession(session: TrainingSession, now = Date.now()): void {
    const runId = telemetrySessionId(session);
    const previous = this.previousSessions.get(runId);
    const basePayload = { scenarioId: session.scenarioId, mode: session.mode } as const;

    if (!previous) {
      this.publish(
        createLearningEvent(
          session,
          learningTelemetryEventType.sessionStarted,
          "session-started",
          session.startedAt,
          basePayload,
        ),
      );

      if (session.activeStepId && isPristineSession(session)) {
        this.stepStartedAt.set(`${runId}:${session.activeStepId}`, session.startedAt);
        this.publish(
          createLearningEvent(
            session,
            learningTelemetryEventType.stepStarted,
            `step-started:${session.activeStepId}`,
            session.startedAt,
            { ...basePayload, stepId: session.activeStepId },
          ),
        );
      }

      for (const usage of session.hintUsage) this.publishHint(session, usage);
      for (const attempt of session.attempts) this.publishAttempt(session, attempt);
      if (session.finishedAt !== null) this.publishSessionCompleted(session, session.finishedAt);
      this.previousSessions.set(runId, session);
      return;
    }

    const previousHints = new Set(previous.hintUsage.map(hintKey));
    for (const usage of session.hintUsage) {
      if (!previousHints.has(hintKey(usage))) this.publishHint(session, usage);
    }

    const previousAttempts = new Set(previous.attempts.map((attempt) => attempt.id));
    for (const attempt of session.attempts) {
      if (!previousAttempts.has(attempt.id)) this.publishAttempt(session, attempt);
    }

    for (const [stepId, status] of Object.entries(session.statuses)) {
      const previousStatus = previous.statuses[stepId];
      if (
        (status === "COMPLETED" || status === "SKIPPED") &&
        previousStatus !== "COMPLETED" &&
        previousStatus !== "SKIPPED"
      ) {
        const startedAt = this.stepStartedAt.get(`${runId}:${stepId}`);
        this.publish(
          createLearningEvent(
            session,
            learningTelemetryEventType.stepCompleted,
            `step-completed:${stepId}`,
            now,
            {
              ...basePayload,
              stepId,
              ...(startedAt === undefined ? {} : { durationMs: Math.max(0, now - startedAt) }),
            },
          ),
        );
      }
    }

    if (session.activeStepId && session.activeStepId !== previous.activeStepId) {
      this.stepStartedAt.set(`${runId}:${session.activeStepId}`, now);
      this.publish(
        createLearningEvent(
          session,
          learningTelemetryEventType.stepStarted,
          `step-started:${session.activeStepId}`,
          now,
          { ...basePayload, stepId: session.activeStepId },
        ),
      );
    }

    if (previous.finishedAt === null && session.finishedAt !== null) {
      this.publishSessionCompleted(session, session.finishedAt);
    }

    this.previousSessions.set(runId, session);
  }

  private publishHint(session: TrainingSession, usage: TrainingSession["hintUsage"][number]): void {
    this.publish(
      createLearningEvent(
        session,
        learningTelemetryEventType.hintUsed,
        `hint:${hintKey(usage)}`,
        usage.timestamp,
        {
          scenarioId: session.scenarioId,
          mode: session.mode,
          stepId: usage.stepId,
          hintLevel: usage.level,
        },
      ),
    );
  }

  private publishAttempt(
    session: TrainingSession,
    attempt: TrainingSession["attempts"][number],
  ): void {
    this.publish(
      createLearningEvent(
        session,
        learningTelemetryEventType.attemptRecorded,
        `attempt:${attempt.id}`,
        attempt.timestamp,
        {
          scenarioId: session.scenarioId,
          mode: session.mode,
          stepId: attempt.stepId,
          outcome: attempt.outcome,
          ...(session.lastAction ? { actionType: session.lastAction } : {}),
        },
      ),
    );
  }

  private publishSessionCompleted(session: TrainingSession, finishedAt: number): void {
    this.publish(
      createLearningEvent(
        session,
        learningTelemetryEventType.sessionCompleted,
        "session-completed",
        finishedAt,
        {
          scenarioId: session.scenarioId,
          mode: session.mode,
          durationMs: Math.max(0, finishedAt - session.startedAt),
        },
      ),
    );
  }

  private publish(event: TrainingEvent): void {
    void this.bus.publish(event);
  }
}

export type TelemetryPseudonymizationMode = "SESSION" | "ANONYMOUS";

export interface FailurePatternMetric {
  pattern: string;
  count: number;
}

export interface StepLearningMetric {
  stepId: string;
  abandonmentCount: number;
  hintUsageCount: number;
  averageDurationMs: number | null;
  failedAttemptCount: number;
  failurePatterns: FailurePatternMetric[];
}

export interface ScenarioLearningAnalytics {
  scenarioId: string;
  sessionsStarted: number;
  sessionsCompleted: number;
  abandonmentCount: number;
  cohortSuppressed: boolean;
  truncated: boolean;
  steps: StepLearningMetric[];
}

export interface TrainingAnalyticsQuery {
  scenarioId: string;
  from?: number;
  to?: number;
}

/** Aggregate-only boundary. It intentionally has no user/session dimension. */
export interface TrainingAnalyticsService {
  loadScenarioMetrics(query: TrainingAnalyticsQuery): Promise<ScenarioLearningAnalytics>;
  loadPseudonymizationMode(): Promise<TelemetryPseudonymizationMode>;
  savePseudonymizationMode(mode: TelemetryPseudonymizationMode): Promise<void>;
}
