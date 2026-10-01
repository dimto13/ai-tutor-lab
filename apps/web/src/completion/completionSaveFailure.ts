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
