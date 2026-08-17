import type {
  TelemetrySink,
  TrainingStateKey,
  TrainingStateRepository,
  TrainingSubjectRef,
} from "@ai-train-lab/training-engine";
import { TrainingTelemetryRecorder } from "./telemetryPipeline";

export type TelemetrySinkFactory = (subject: TrainingSubjectRef) => TelemetrySink;

function subjectKey(subject: TrainingSubjectRef): string {
  return `${subject.tenantId}\u0000${subject.userId}`;
}

/**
 * Application-layer decorator: the persisted TrainingSession stays authoritative while its
 * transitions are mirrored into the existing TrainingEvent/TelemetrySink pipeline.
 */
export class TelemetryTrainingStateRepository implements TrainingStateRepository {
  private readonly recorders = new Map<string, TrainingTelemetryRecorder>();

  constructor(
    private readonly repository: TrainingStateRepository,
    private readonly sinkFactory: TelemetrySinkFactory,
    private readonly now: () => number = Date.now,
  ) {}

  loadSession(key: TrainingStateKey) {
    return this.repository.loadSession(key);
  }

  saveSession(
    key: Parameters<TrainingStateRepository["saveSession"]>[0],
    session: Parameters<TrainingStateRepository["saveSession"]>[1],
    options: Parameters<TrainingStateRepository["saveSession"]>[2],
  ) {
    this.recorderFor(key.subject).recordSession(session, this.now());
    return this.repository.saveSession(key, session, options);
  }

  loadRuntimeSnapshot(
    key: Parameters<TrainingStateRepository["loadRuntimeSnapshot"]>[0],
    runtimeId: Parameters<TrainingStateRepository["loadRuntimeSnapshot"]>[1],
  ) {
    return this.repository.loadRuntimeSnapshot(key, runtimeId);
  }

  saveRuntimeSnapshot(
    key: Parameters<TrainingStateRepository["saveRuntimeSnapshot"]>[0],
    runtimeId: Parameters<TrainingStateRepository["saveRuntimeSnapshot"]>[1],
    snapshot: Parameters<TrainingStateRepository["saveRuntimeSnapshot"]>[2],
    options: Parameters<TrainingStateRepository["saveRuntimeSnapshot"]>[3],
  ) {
    return this.repository.saveRuntimeSnapshot(key, runtimeId, snapshot, options);
  }

  deleteRuntimeSnapshot(
    key: Parameters<TrainingStateRepository["deleteRuntimeSnapshot"]>[0],
    runtimeId: Parameters<TrainingStateRepository["deleteRuntimeSnapshot"]>[1],
    options: Parameters<TrainingStateRepository["deleteRuntimeSnapshot"]>[2],
  ) {
    return this.repository.deleteRuntimeSnapshot(key, runtimeId, options);
  }

  private recorderFor(subject: TrainingSubjectRef): TrainingTelemetryRecorder {
    const key = subjectKey(subject);
    let recorder = this.recorders.get(key);
    if (!recorder) {
      recorder = new TrainingTelemetryRecorder(this.sinkFactory(subject));
      this.recorders.set(key, recorder);
    }
    return recorder;
  }
}
