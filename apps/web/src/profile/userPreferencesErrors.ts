export type UserPreferencesOperation = "load" | "save";

const USER_PREFERENCES_ERROR_MESSAGES: Record<UserPreferencesOperation, string> = {
  load: "Die Lernpräferenzen konnten nicht geladen werden. Bitte versuche es erneut.",
  save: "Die Lernpräferenzen konnten nicht gespeichert werden. Bitte versuche es erneut.",
};

export function userPreferencesOperationError(
  operation: UserPreferencesOperation,
  cause: unknown,
): Error {
  return new Error(USER_PREFERENCES_ERROR_MESSAGES[operation], { cause });
}

export function reportUserPreferencesFailure(
  operation: UserPreferencesOperation,
  cause: unknown,
): void {
  console.error(`[user-preferences] ${operation} failed`, cause);
}
