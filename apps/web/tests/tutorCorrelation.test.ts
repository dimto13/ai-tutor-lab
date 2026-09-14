import assert from "node:assert/strict";
import test from "node:test";
import { createTutorCorrelation } from "../src/tutor/llm/correlation.ts";

const SUBJECT = "7a1f2c3d-0000-4a4b-9c9d-123456789abc";

test("the tenant reference is stable per tenant and hides the tenant ID (#482)", async () => {
  const personal = `personal:${SUBJECT}`;
  const first = await createTutorCorrelation(personal, "relay-bearer", () => "request-1");
  const second = await createTutorCorrelation(personal, "relay-bearer", () => "request-2");

  assert.match(first.tenantRef, /^[0-9a-f]{16}$/);
  assert.equal(first.tenantRef, second.tenantRef);
  assert.deepEqual([first.requestId, second.requestId], ["request-1", "request-2"]);
  assert.equal(first.tenantRef.includes(SUBJECT.slice(0, 8)), false);
  assert.notEqual(
    (await createTutorCorrelation("tenant:acme", "relay-bearer")).tenantRef,
    first.tenantRef,
  );
  assert.notEqual(
    (await createTutorCorrelation(personal, "another-key")).tenantRef,
    first.tenantRef,
  );
});

test("every tutor request gets its own UUID by default", async () => {
  const { requestId } = await createTutorCorrelation("tenant:acme", "relay-bearer");
  assert.match(requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
