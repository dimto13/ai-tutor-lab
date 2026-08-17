import type { TrainingEvent, TrainingSubjectRef } from "@ai-train-lab/training-engine";
import type { TelemetryOutbox } from "../telemetryPipeline";

const TELEMETRY_OUTBOX_PREFIX = "ai-training-lab.telemetry-outbox.v1";
const TELEMETRY_DEAD_LETTER_PREFIX = "ai-training-lab.telemetry-dead-letter.v1";

function subjectStorageSuffix(subject: TrainingSubjectRef): string {
  return [
    encodeURIComponent(subject.tenantId ?? "personal"),
    encodeURIComponent(subject.userId),
  ].join(":");
}

function storageKey(subject: TrainingSubjectRef): string {
  return `${TELEMETRY_OUTBOX_PREFIX}:${subjectStorageSuffix(subject)}`;
}

function deadLetterStorageKey(subject: TrainingSubjectRef): string {
  return `${TELEMETRY_DEAD_LETTER_PREFIX}:${subjectStorageSuffix(subject)}`;
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

interface DeadLetterRecord {
  event: TrainingEvent;
  reason: string;
}

function parseDeadLetters(raw: string | null): DeadLetterRecord[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is DeadLetterRecord => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const candidate = value as Partial<DeadLetterRecord>;
      return isTrainingEvent(candidate.event) && typeof candidate.reason === "string";
    });
  } catch {
    return [];
  }
}

/**
 * Browser storage is scoped by the already-authenticated subject only to prevent a later login
 * from draining another user's queue. The server still derives tenant/user authoritatively and
 * receives no client-provided identity fields. Permanent server rejects are retained separately so
 * they do not block later valid events and are not silently lost.
 */
export function createLocalStorageTelemetryOutbox(
  subject: TrainingSubjectRef,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = window.localStorage,
): TelemetryOutbox {
  const key = storageKey(subject);
  const deadLetterKey = deadLetterStorageKey(subject);
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
    deadLetter(event, reason) {
      const records = parseDeadLetters(storage.getItem(deadLetterKey));
      if (records.some((record) => record.event.id === event.id)) return;
      storage.setItem(deadLetterKey, JSON.stringify([...records, { event, reason }]));
    },
  };
}