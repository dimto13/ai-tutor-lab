import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const writeUrl = new URL("../../amplify/data/issue-attestation-write.js", import.meta.url);

test("idempotent issuance reports an already-expired attestation as expired", async () => {
  let source = await readFile(writeUrl, "utf8");
  source = source.replace(/^import[^\n]*\n/m, "").replace(/export function /g, "function ");
  source += "\nglobalThis.__resolver = { response };";

  const util = {
    error(message: string, type?: string): never {
      throw new Error(`${type ?? "ResolverError"}: ${message}`);
    },
    time: {
      nowEpochMilliSeconds(): number {
        return Date.parse("2026-08-18T04:00:00.000Z");
      },
    },
  };
  const sandbox: Record<string, unknown> = { util, runtime: {} };
  runInNewContext(source, sandbox, { filename: "issue-attestation-write.js" });
  const resolver = sandbox["__resolver"] as {
    response: (ctx: Record<string, unknown>) => unknown;
  };

  const result = resolver.response({
    stash: { attestationAppendToken: "retry-token" },
    result: {
      id: "attestation-1",
      tenantId: "tenant-a",
      userId: "user-1",
      scenarioId: "generic.challenge",
      scenarioVersion: "1",
      productId: "generic-product",
      productVersion: "2025.01",
      learningObjectiveIds: ["lo-a"],
      issuedAt: Date.parse("2025-01-01T00:00:00.000Z"),
      validUntil: Date.parse("2026-01-01T00:00:00.000Z"),
      sourceRevision: 1,
      scenarioRunId: "run-1",
      sessionId: "session-1",
      evidence: {},
      provenance: {},
      signingStatus: "external_signature_required",
      signingAlgorithm: null,
      signingKeyId: null,
      signature: null,
      appendToken: "existing-token",
    },
  }) as Record<string, unknown>;

  assert.equal(result["created"], false);
  assert.equal(result["reason"], "already_exists");
  const attestation = result["attestation"] as Record<string, unknown>;
  assert.equal(attestation["validityStatus"], "expired");
  assert.equal(attestation["recertificationRecommended"], true);
});
