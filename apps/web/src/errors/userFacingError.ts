export type UserFacingErrorKind = "temporary" | "conflict" | "forbidden" | "unexpected";

export class UserFacingError extends Error {
  readonly kind: UserFacingErrorKind;
  readonly diagnosticMessage: string;

  constructor(kind: UserFacingErrorKind, diagnosticMessage: string, cause?: unknown) {
    super("A provider operation failed", { cause });
    this.name = "UserFacingError";
    this.kind = kind;
    this.diagnosticMessage = diagnosticMessage;
  }
}

const CONFLICT_PATTERN = /ConditionalCheckFailed|conditional request failed|\bconflict\b/i;
const FORBIDDEN_PATTERN = /AccessDenied|Unauthorized|Forbidden|not authorized|permission/i;

function technicalMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;
  return "Unknown provider error";
}

export function userFacingError(cause: unknown): UserFacingError {
  const diagnosticMessage = technicalMessage(cause);
  if (CONFLICT_PATTERN.test(diagnosticMessage)) {
    return new UserFacingError("conflict", diagnosticMessage, cause);
  }
  if (FORBIDDEN_PATTERN.test(diagnosticMessage)) {
    return new UserFacingError("forbidden", diagnosticMessage, cause);
  }
  return new UserFacingError("unexpected", diagnosticMessage, cause);
}

export function userFacingErrorMessage(
  error: UserFacingError,
  language: "de" | "en",
  action: "read" | "write" | "export",
): string {
  const de = {
    conflict:
      "Die Daten wurden zwischenzeitlich geändert. Lade den aktuellen Stand und versuche es erneut.",
    forbidden: "Diese Aktion ist für dein Konto nicht verfügbar. Wende dich an die Administration.",
    read: "Diese Information ist derzeit nicht verfügbar. Versuche es erneut.",
    write:
      "Die Änderung konnte gerade nicht gespeichert werden. Deine bisherigen Daten bleiben erhalten. Versuche es erneut.",
    export: "Der Export konnte gerade nicht erstellt werden. Deine Daten wurden nicht verändert. Versuche es erneut.",
  } as const;
  const en = {
    conflict: "The data changed in the meantime. Reload the current state and try again.",
    forbidden: "This action is not available for your account. Contact your administrator.",
    read: "This information is currently unavailable. Try again.",
    write: "The change could not be saved. Your existing data remains unchanged. Try again.",
    export: "The export could not be created. Your data was not changed. Try again.",
  } as const;
  const messages = language === "en" ? en : de;
  if (error.kind === "conflict") return messages.conflict;
  if (error.kind === "forbidden") return messages.forbidden;
  return messages[action];
}
