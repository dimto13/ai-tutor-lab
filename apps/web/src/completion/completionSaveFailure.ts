import { TrainingStateUnavailableError } from "@ai-train-lab/training-engine";
import {
  UserFacingError,
  userFacingError,
  userFacingErrorMessage,
} from "../errors/userFacingError.ts";

/**
 * A finished training whose authoritative write failed must say so.
 *
 * `OfflineBufferedTrainingStateRepository` deliberately fails closed for completed sessions (#467)
 * instead of reporting a buffered local write as saved. That signal is only worth anything if the
 * completion screen turns it into something the learner can see and retry.
 */
const UNAVAILABLE_MESSAGE =
  "Dein Abschluss ist noch nicht auf dem Server gespeichert. Der Fortschritt bleibt auf diesem Gerät erhalten und wird nachgetragen, sobald die Verbindung wieder steht. Du kannst das Speichern jetzt erneut versuchen.";

export function completionSaveFailureMessage(cause: unknown, language: "de" | "en" = "de"): string {
  if (cause instanceof TrainingStateUnavailableError) {
    if (language === "en") {
      return "Your completion is not saved on the server yet. Your progress stays on this device and is submitted once the connection is back. You can retry saving now.";
    }
    return UNAVAILABLE_MESSAGE;
  }

  const error = cause instanceof UserFacingError ? cause : userFacingError(cause);
  const detail = userFacingErrorMessage(error, language, "write");
  const prefix =
    language === "en"
      ? "Your completion is not saved yet."
      : "Dein Abschluss ist noch nicht gespeichert.";
  return `${prefix} ${detail}`;
}

export interface TrainingStateSaveContext {
  scenarioId: string;
  mode: string;
  finishedAt: number | null;
  occurredAt: number;
}

const MAX_CAUSE_DEPTH = 5;
const MAX_DIAGNOSTIC_LENGTH = 1200;

function describeOne(cause: unknown): string | null {
  if (cause instanceof UserFacingError) return cause.diagnosticMessage;
  if (cause instanceof Error) {
    return cause.name && cause.name !== "Error" ? `${cause.name}: ${cause.message}` : cause.message;
  }
  if (typeof cause === "string") return cause;
  if (typeof cause === "object" && cause !== null) {
    const errors = Reflect.get(cause, "errors");
    if (Array.isArray(errors)) {
      return errors
        .map((entry: unknown) => {
          if (typeof entry !== "object" || entry === null) return String(entry);
          const errorType = Reflect.get(entry, "errorType");
          const message = Reflect.get(entry, "message");
          return [errorType, message].filter((part) => typeof part === "string").join(": ");
        })
        .join(" | ");
    }
    const message = Reflect.get(cause, "message");
    if (typeof message === "string") return message;
  }
  return null;
}

function nextCause(cause: unknown): unknown {
  if (cause instanceof TrainingStateUnavailableError) return cause.originalError;
  if (cause instanceof Error) return cause.cause;
  return undefined;
}

/**
 * Die technische Ursache eines fehlgeschlagenen Trainingsstand-Writes, so wie das Backend sie
 * gemeldet hat.
 *
 * Die Lernenden-Meldung oben ist absichtlich generisch. Ohne diesen Text war die eigentliche
 * AppSync-/DynamoDB-Meldung aber nirgends mehr sichtbar: Ein dauerhaft scheiternder Abschluss
 * liess sich wochenlang nicht einer Ursache zuordnen (#528, #545). Die Kette folgt `cause` und
 * `originalError`, weil Puffer- und Retry-Schichten den Ausgangsfehler einwickeln.
 */
export function trainingStateSaveDiagnostic(
  cause: unknown,
  context: TrainingStateSaveContext,
): string {
  const chain: string[] = [];
  let current: unknown = cause;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== undefined; depth += 1) {
    const description = describeOne(current);
    if (description && !chain.includes(description)) chain.push(description);
    current = nextCause(current);
  }

  const kind =
    cause instanceof TrainingStateUnavailableError
      ? "unavailable"
      : (cause instanceof UserFacingError ? cause : userFacingError(cause)).kind;

  const lines = [
    `Operation: saveTrainingState (${context.finishedAt === null ? "Zwischenstand" : "Abschluss"})`,
    `Training: ${context.scenarioId} · ${context.mode}`,
    `Zeitpunkt: ${new Date(context.occurredAt).toISOString()}`,
    `Fehlerklasse: ${kind}`,
    `Ursache: ${chain.length > 0 ? chain.join(" ← ") : "unbekannt"}`,
  ];
  const text = lines.join("\n");
  return text.length > MAX_DIAGNOSTIC_LENGTH ? `${text.slice(0, MAX_DIAGNOSTIC_LENGTH)} …` : text;
}
