import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  UserFacingError,
  userFacingError,
  userFacingErrorMessage,
} from "../src/errors/userFacingError.ts";

const routePath = fileURLToPath(new URL("../src/routes/datentransparenz.tsx", import.meta.url));

const rawProviderError =
  "Lambda:Unhandled GraphQL resolver failed at /var/task/index.js for tenant-123";

test("representative backend diagnostics stay out of localized user messages", () => {
  const error = userFacingError(new Error(rawProviderError));

  assert.ok(error instanceof Error);
  assert.ok(error instanceof UserFacingError);
  assert.match(error.diagnosticMessage, /Lambda:Unhandled/);

  for (const language of ["de", "en"] as const) {
    const readMessage = userFacingErrorMessage(error, language, "read");
    const writeMessage = userFacingErrorMessage(error, language, "write");

    assert.doesNotMatch(readMessage, /Lambda|GraphQL|resolver|\/var\/task|tenant-123/i);
    assert.doesNotMatch(writeMessage, /Lambda|GraphQL|resolver|\/var\/task|tenant-123/i);
  }
});

test("data transparency UI renders the safe contract and exposes keyboard retry", async () => {
  const routeSource = await readFile(routePath, "utf8");

  assert.match(routeSource, /role="alert"/);
  assert.match(routeSource, /userFacingErrorMessage\(contextError, language, "read"\)/);
  assert.match(routeSource, /type="button"[\s\S]*?setContextError\(null\)[\s\S]*?setContextReload/);
  assert.doesNotMatch(routeSource, /contextError\.message|cause\.message/);
});

test("data transparency export uses the safe write contract", async () => {
  const routeSource = await readFile(routePath, "utf8");

  assert.match(
    routeSource,
    /setExportStatus\(userFacingErrorMessage\(safeError\(cause\), language, "export"\)\)/,
  );
  assert.doesNotMatch(routeSource, /setExportStatus\([^)]*(?:cause|error)\.message/i);
});
