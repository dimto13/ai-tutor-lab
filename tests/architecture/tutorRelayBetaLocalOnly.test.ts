import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const RESOURCE = path.resolve("amplify/functions/tutor-relay/resource.ts");

test("the closed-beta tutor relay is configured for one local-only model attempt", async () => {
  const source = await readFile(RESOURCE, "utf8");

  assert.match(source, /TUTOR_RELAY_PRIMARY_MODEL:\s*"gemma4:e4b@local"/);
  assert.match(source, /TUTOR_RELAY_FALLBACK_MODEL:\s*""/);
});
