import { describe, expect, it } from "vitest";
import { UserFacingError, userFacingError, userFacingErrorMessage } from "./userFacingError";

describe("user-facing error contract", () => {
  it("keeps provider diagnostics separate from the public message", () => {
    const raw = "Lambda:Unhandled GraphQL resolver failed at /var/task/index.js";
    const error = userFacingError(new Error(raw));

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UserFacingError);
    expect(error.diagnosticMessage).toContain("Lambda:Unhandled");

    const message = userFacingErrorMessage(error, "de", "read");
    expect(message).toBe("Diese Information ist derzeit nicht verfügbar. Versuche es erneut.");
    expect(message).not.toMatch(/Lambda|GraphQL|resolver|\/var\/task/i);
  });

  it("localizes recovery guidance and states write data remains unchanged", () => {
    const error = userFacingError(new Error("DynamoDB request failed"));

    expect(userFacingErrorMessage(error, "de", "write")).toContain(
      "Deine bisherigen Daten bleiben erhalten",
    );
    expect(userFacingErrorMessage(error, "en", "write")).toContain(
      "Your existing data remains unchanged",
    );
  });

  it("maps conflicts and authorization failures without exposing raw provider text", () => {
    const conflict = userFacingError(new Error("ConditionalCheckFailedException"));
    const forbidden = userFacingError(new Error("AccessDeniedException: tenant-123"));

    expect(conflict.kind).toBe("conflict");
    expect(forbidden.kind).toBe("forbidden");
    expect(userFacingErrorMessage(conflict, "en", "write")).not.toContain(
      "ConditionalCheckFailed",
    );
    expect(userFacingErrorMessage(forbidden, "de", "read")).not.toMatch(/AccessDenied|tenant-123/);
  });
});
