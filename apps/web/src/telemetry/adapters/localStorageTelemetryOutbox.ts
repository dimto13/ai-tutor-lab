import type { TrainingEvent, TrainingSubjectRef } from "@ai-train-lab/training-engine";
import type { TelemetryOutbox } from "../telemetryPipeline";

const TELEMETRY_OUTBOX_PREFIX = "ai-training-lab.telemetry-outbox.v1";

function storageKey(subject: TrainingSubjectRef): string {
  return [
    TELEMETRY_OUTBOX_PREFIX,
    encodeURIComponent(subject.tenantId),
    encodeURIComponent(subject.userId),
  ].join(":");
}

function isTrainingEvent(value: unknown): value is TrainingEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<TrainingEvent>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.source === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.timestamp === "string" &&
    typeof candidate.sessionId === "string" &&
    Object.prototype.hasOwnProperty.call(candidate, "payload")
  );
}

/**
 * The browser key is scoped by the already-authenticated subject only to prevent a later login
 * from draining another user's queue. The server still derives tenant/user authoritatively and
 * receives no client-provided identity fields.
 */
export function createLocalStorageTelemetryOutbox(
  subject: TrainingSubjectRef,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = window.localStorage,
): TelemetryOutbox {
  const key = storageKey(subject);
  return {
    load() {
      const raw = storage.getItem(key);
      if (!raw) return [];
      try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isTrainingEvent) : [];
      } catch {
        return [];
      }
    },
    save(events) {
      if (events.length === 0) {
        storage.removeItem(key);
        return;
      }
      storage.setItem(key, JSON.stringify(events));
    },
  };
}
