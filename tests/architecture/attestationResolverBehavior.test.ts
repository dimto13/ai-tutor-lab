import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const sessionTemplateUrl = new URL(
  "../../amplify/data/issue-attestation-load-session.js",
  import.meta.url,
);
const writeUrl = new URL("../../amplify/data/issue-attestation-write.js", import.meta.url);
const exportUrl = new URL("../../amplify/data/export-attestation.js", import.meta.url);

type Resolver = {
  request: (ctx: Record<string, unknown>) => Record<string, unknown>;
  response: (ctx: Record<string, unknown>) => unknown;
};

function compileResolver(
  source: string,
  globals: Record<string, unknown>,
  definitionSource?: string,
): Resolver {
  let executable = source.replace(/^import[^\n]*\n/m, "");
  if (definitionSource !== undefined) {
    executable = executable.replace(
      /const ATTESTATION_DEFINITIONS = \{[\s\S]*?\};/,
      `const ATTESTATION_DEFINITIONS = ${definitionSource};`,
    );
  }
  executable = executable.replace(/export function /g, "function ");
  executable += "\nglobalThis.__resolver = { request, response };";
  const sandbox: Record<string, unknown> = { ...globals };
  runInNewContext(executable, sandbox, { filename: "appsync-resolver.js" });
  return sandbox["__resolver"] as Resolver;
}

function error(message: string, type?: string): never {
  throw new Error(`${type ?? "ResolverError"}: ${message}`);
}

function baseUtil(nowIso = "2026-08-18T04:00:00.000Z") {
  let autoId = 0;
  return {
    unauthorized(): never {
      throw new Error("Unauthorized");
    },
    error,
    base64Encode(value: string): string {
      return Buffer.from(value, "utf8").toString("base64");
    },
    autoId(): string {
      autoId += 1;
      return `token-${autoId}`;
    },
    dynamodb: {
      toMapValues(value: Record<string, unknown>): Record<string, unknown> {
        return value;
      },
    },
    time: {
      nowISO8601(): string {
        return nowIso;
      },
      parseISO8601ToEpochMilliSeconds(value: string): number {
        return Date.parse(value);
      },
      nowEpochMilliSeconds(): number {
        return Date.parse(nowIso);
      },
    },
  };
}

function attestationDefinition(learningObjectiveIds = ["lo-a", "lo-b"]): string {
  return JSON.stringify({
    "generic.challenge": {
      mode: "challenge",
      scenarioVersion: "3",
      productId: "generic-product",
      productVersion: "2026.08",
      learningObjectiveIds,
    },
  });
}

function sessionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenantId: "tenant-a",
    userId: "user-1",
    scenarioId: "generic.challenge",
    mode: "challenge",
    revision: 7,
    payload: {
      id: "session-1",
      scenarioId: "generic.challenge",
      mode: "challenge",
      startedAt: Date.UTC(2026, 7, 18, 3, 0),
      finishedAt: Date.UTC(2026, 7, 18, 3, 20),
      challengeOutcome: "passed",
    },
    ...overrides,
  };
}

function issueContext(): Record<string, unknown> {
  return {
    identity: { sub: "user-1", groups: ["role:learner", "tenant:tenant-a"] },
    args: { scenarioId: "generic.challenge", userId: "foreign-user", tenantId: "tenant-b" },
    stash: {},
  };
}

test("passed challenge with complete authoritative objectives resolves exact ScenarioRun evidence", async () => {
  const source = await readFile(sessionTemplateUrl, "utf8");
  const resolver = compileResolver(source, { util: baseUtil() }, attestationDefinition());
  const ctx = issueContext();
  const request = resolver.request(ctx);
  assert.equal(request["operation"], "GetItem");
  assert.equal(request["consistentRead"], true);
  assert.doesNotMatch(JSON.stringify(request), /foreign-user|tenant-b/);

  resolver.response({ ...ctx, result: sessionRow() });
  const stash = ctx["stash"] as Record<string, unknown>;
  const context = stash["attestationContext"] as Record<string, unknown>;
  assert.equal(context["scenarioId"], "generic.challenge");
  assert.equal(context["scenarioVersion"], "3");
  assert.equal(context["productVersion"], "2026.08");
  assert.deepEqual(Array.from(context["learningObjectiveIds"] as string[]), ["lo-a", "lo-b"]);
  assert.match(String(context["scenarioRunId"]), /^scenario-run:v1\|/);
  assert.match(String(context["scenarioRunId"]), /\|v:s1:3\|/);
  assert.equal(context["sourceRevision"], 7);
});

test("challenge that is not passed cannot produce attestation context", async () => {
  const source = await readFile(sessionTemplateUrl, "utf8");
  const resolver = compileResolver(source, { util: baseUtil() }, attestationDefinition());
  const ctx = issueContext();
  resolver.request(ctx);
  const failed = sessionRow({
    payload: {
      ...(sessionRow()["payload"] as Record<string, unknown>),
      challengeOutcome: "timed_out",
    },
  });
  assert.throws(
    () => resolver.response({ ...ctx, result: failed }),
    /Only passed challenges can produce attestations/,
  );
});

test("challenge authority with an incomplete objective set is rejected before persistence", async () => {
  const source = await readFile(sessionTemplateUrl, "utf8");
  const resolver = compileResolver(source, { util: baseUtil() }, attestationDefinition([]));
  assert.throws(
    () => resolver.request(issueContext()),
    /Challenge has no authoritative learning objectives/,
  );
});

test("suspect or otherwise ineligible ScenarioRun exits before any Attestation write", async () => {
  const source = await readFile(writeUrl, "utf8");
  const earlyReturn = (value: unknown): never => {
    const failure = new Error("EARLY_RETURN");
    Object.assign(failure, { value });
    throw failure;
  };
  const resolver = compileResolver(source, { util: baseUtil(), runtime: { earlyReturn } });
  const ctx = {
    stash: {
      attestationSubject: { userId: "user-1", tenantId: "tenant-a", storageTenantId: "tenant-a" },
      attestationContext: {
        scenarioRunId: "run-1",
        sessionId: "session-1",
        scenarioId: "generic.challenge",
        scenarioVersion: "3",
        productId: "generic-product",
        productVersion: "2026.08",
        learningObjectiveIds: ["lo-a", "lo-b"],
        sourceRevision: 7,
        challengeOutcome: "passed",
      },
      attestationRun: { evidenceEligible: false, evidenceStatus: "suspect_fast" },
    },
  };

  try {
    resolver.request(ctx);
    assert.fail("ineligible run must not return a PutItem request");
  } catch (reason) {
    assert.ok(reason instanceof Error);
    assert.equal(reason.message, "EARLY_RETURN");
    const value = Reflect.get(reason, "value") as Record<string, unknown>;
    assert.equal(value["created"], false);
    assert.equal(value["reason"], "run_not_evidence_eligible");
    assert.equal(value["attestation"], null);
  }
});

test("eligible run persists all objectives, audit evidence, twelve-month validity and stable id", async () => {
  const source = await readFile(writeUrl, "utf8");
  const resolver = compileResolver(source, {
    util: baseUtil("2024-02-29T12:30:15.250Z"),
    runtime: { earlyReturn: () => assert.fail("eligible run must not early return") },
  });
  const stash = {
    attestationSubject: { userId: "user-1", tenantId: "tenant-a", storageTenantId: "tenant-a" },
    attestationContext: {
      scenarioRunId: "run-1",
      sessionId: "session-1",
      scenarioId: "generic.challenge",
      scenarioVersion: "3",
      productId: "generic-product",
      productVersion: "2026.08",
      learningObjectiveIds: ["lo-b", "lo-a"],
      sourceRevision: 7,
      challengeOutcome: "passed",
    },
    attestationRun: { evidenceEligible: true, evidenceStatus: "eligible" },
  };
  const first = resolver.request({ stash }) as Record<string, unknown>;
  const second = resolver.request({ stash }) as Record<string, unknown>;
  assert.equal(first["operation"], "PutItem");
  assert.equal(
    (first["condition"] as Record<string, unknown>)["expression"],
    "attribute_not_exists(id)",
  );
  assert.deepEqual(first["key"], second["key"], "retry must retain identical attestation id");

  const values = first["attributeValues"] as Record<string, unknown>;
  assert.deepEqual(Array.from(values["learningObjectiveIds"] as string[]), ["lo-a", "lo-b"]);
  assert.equal(values["validUntil"], Date.parse("2025-02-28T12:30:15.250Z"));
  assert.equal(values["scenarioVersion"], "3");
  assert.equal(values["productVersion"], "2026.08");
  assert.equal(values["scenarioRunId"], "run-1");
  assert.equal((values["evidence"] as Record<string, unknown>)["evidenceStatus"], "eligible");
  assert.equal(
    (values["provenance"] as Record<string, unknown>)["type"],
    "authoritative-challenge-run",
  );
  assert.equal(values["signingStatus"], "external_signature_required");

  const id = (first["key"] as Record<string, unknown>)["id"];
  const existingRow = { id, ...values, appendToken: "existing-token" };
  const result = resolver.response({
    stash: { attestationAppendToken: values["appendToken"] },
    result: existingRow,
  }) as Record<string, unknown>;
  assert.equal(result["created"], false);
  assert.equal(result["reason"], "already_exists");
});

test("different ScenarioRun and scenario/product versions produce distinct identities", async () => {
  const source = await readFile(writeUrl, "utf8");
  const resolver = compileResolver(source, {
    util: baseUtil(),
    runtime: { earlyReturn: () => assert.fail("eligible run must not early return") },
  });
  const common = {
    attestationSubject: { userId: "user-1", tenantId: "tenant-a", storageTenantId: "tenant-a" },
    attestationRun: { evidenceEligible: true, evidenceStatus: "eligible" },
  };
  const context = {
    scenarioRunId: "run-1",
    sessionId: "session-1",
    scenarioId: "generic.challenge",
    scenarioVersion: "3",
    productId: "generic-product",
    productVersion: "2026.08",
    learningObjectiveIds: ["lo-a"],
    sourceRevision: 7,
    challengeOutcome: "passed",
  };
  const id = (
    resolver.request({ stash: { ...common, attestationContext: context } })["key"] as Record<
      string,
      unknown
    >
  )["id"];
  for (const changed of [
    { ...context, scenarioRunId: "run-2" },
    { ...context, scenarioVersion: "4" },
    { ...context, productVersion: "2027.01" },
  ]) {
    const other = (
      resolver.request({ stash: { ...common, attestationContext: changed } })["key"] as Record<
        string,
        unknown
      >
    )["id"];
    assert.notEqual(other, id);
  }
});

function persistedAttestation(): Record<string, unknown> {
  return {
    id: "attestation:v2|t:s8:tenant-a|u:s6:user-1|run:s5:run-1",
    tenantId: "tenant-a",
    userId: "user-1",
    scenarioId: "generic.challenge",
    scenarioVersion: "3",
    productId: "generic-product",
    productVersion: "2026.08",
    learningObjectiveIds: ["lo-a", "lo-b"],
    issuedAt: Date.parse("2026-01-01T00:00:00.000Z"),
    validUntil: Date.parse("2027-01-01T00:00:00.000Z"),
    sourceRevision: 7,
    scenarioRunId: "run-1",
    sessionId: "session-1",
    evidence: {
      scenarioRunId: "run-1",
      sessionId: "session-1",
      sourceRevision: 7,
      challengeOutcome: "passed",
      evidenceStatus: "eligible",
      evidenceEligible: true,
      learningObjectiveIds: ["lo-a", "lo-b"],
    },
    provenance: {
      type: "authoritative-challenge-run",
      scenarioId: "generic.challenge",
      scenarioVersion: "3",
      productId: "generic-product",
      productVersion: "2026.08",
      scenarioRunId: "run-1",
      sessionId: "session-1",
      sourceRevision: 7,
    },
    signingStatus: "external_signature_required",
    signingAlgorithm: null,
    signingKeyId: null,
    signature: null,
  };
}

test("CSV and PDF exports contain the same authoritative persisted attestation data", async () => {
  const source = await readFile(exportUrl, "utf8");
  const util = baseUtil("2026-08-18T04:00:00.000Z");
  const resolver = compileResolver(source, { util });
  const row = persistedAttestation();
  const subject = { userId: "user-1", storageTenantId: "tenant-a" };

  const csv = resolver.response({
    stash: { attestationExportSubject: subject, attestationExportFormat: "CSV" },
    result: row,
  }) as Record<string, unknown>;
  const csvText = Buffer.from(String(csv["contentBase64"]), "base64").toString("utf8");
  assert.match(csvText, /"attestation_id"/);
  assert.match(csvText, /"learning_objective_ids"/);
  assert.match(csvText, /generic\.challenge/);
  assert.match(csvText, /2026\.08/);
  assert.match(csvText, /lo-a\|lo-b/);
  assert.match(csvText, /authoritative-challenge-run/);
  assert.match(csvText, /external_signature_required/);

  const pdf = resolver.response({
    stash: { attestationExportSubject: subject, attestationExportFormat: "PDF" },
    result: row,
  }) as Record<string, unknown>;
  const pdfText = Buffer.from(String(pdf["contentBase64"]), "base64").toString("ascii");
  assert.match(pdfText, /^%PDF-1\.4/);
  assert.match(pdfText, /xref\n0 6/);
  assert.match(pdfText, /trailer/);
  assert.match(pdfText, /Scenario: generic\.challenge/);
  assert.match(pdfText, /Scenario version: 3/);
  assert.match(pdfText, /Product: generic-product 2026\.08/);
  assert.match(pdfText, /Evidence run: run-1/);
  assert.match(pdfText, /- lo-a/);
  assert.match(pdfText, /- lo-b/);
  assert.match(pdfText, /External cryptographic signature required/);
  assert.equal(csv["attestationId"], row["id"]);
  assert.equal(pdf["attestationId"], row["id"]);
});

test("export rejects cross-tenant or cross-user access even when an attestation id is known", async () => {
  const source = await readFile(exportUrl, "utf8");
  const resolver = compileResolver(source, { util: baseUtil() });
  const row = persistedAttestation();
  assert.throws(
    () =>
      resolver.response({
        stash: {
          attestationExportSubject: { userId: "user-1", storageTenantId: "tenant-b" },
          attestationExportFormat: "CSV",
        },
        result: row,
      }),
    /Unauthorized/,
  );
  assert.throws(
    () =>
      resolver.response({
        stash: {
          attestationExportSubject: { userId: "user-2", storageTenantId: "tenant-a" },
          attestationExportFormat: "CSV",
        },
        result: row,
      }),
    /Unauthorized/,
  );
});
