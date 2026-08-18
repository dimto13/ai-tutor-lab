import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const challengeUrl = new URL(
  "../../content/scenarios/data-classification-ai-usage.challenge.json",
  import.meta.url,
);
const learningObjectivesUrl = new URL("../../content/learning-objectives/de.json", import.meta.url);
const sessionResolverUrl = new URL(
  "../../amplify/data/issue-attestation-load-session.generated.js",
  import.meta.url,
);
const runResolverUrl = new URL("../../amplify/data/issue-attestation-load-run.js", import.meta.url);
const writeResolverUrl = new URL("../../amplify/data/issue-attestation-write.js", import.meta.url);

type Resolver = {
  request: (ctx: Record<string, unknown>) => Record<string, unknown>;
  response: (ctx: Record<string, unknown>) => unknown;
};

type ChallengeScenario = {
  id: string;
  mode: "challenge";
  learningObjectives: string[];
  environment: {
    productId: string;
    version: string;
  };
};

function compileResolver(source: string, globals: Record<string, unknown>): Resolver {
  let executable = source.replace(/^import[^\n]*\n/gm, "");
  executable = executable.replace(/export function /g, "function ");
  executable += "\nglobalThis.__resolver = { request, response };";
  const sandbox: Record<string, unknown> = { ...globals };
  runInNewContext(executable, sandbox, { filename: "classification-attestation-resolver.js" });
  return sandbox["__resolver"] as Resolver;
}

function resolverError(message: string, type?: string): never {
  throw new Error(`${type ?? "ResolverError"}: ${message}`);
}

function resolverUtil(nowIso = "2026-08-18T15:00:00.000Z") {
  let autoId = 0;
  return {
    unauthorized(): never {
      throw new Error("Unauthorized");
    },
    error: resolverError,
    base64Encode(value: string): string {
      return Buffer.from(value, "utf8").toString("base64");
    },
    autoId(): string {
      autoId += 1;
      return `classification-attestation-${autoId}`;
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

test("passed Classification challenge produces a generic attestation for its referenced learning objectives", async () => {
  const [challengeSource, objectiveSource, sessionSource, runSource, writeSource] =
    await Promise.all([
      readFile(challengeUrl, "utf8"),
      readFile(learningObjectivesUrl, "utf8"),
      readFile(sessionResolverUrl, "utf8"),
      readFile(runResolverUrl, "utf8"),
      readFile(writeResolverUrl, "utf8"),
    ]);

  const challenge = JSON.parse(challengeSource) as ChallengeScenario;
  const objectiveCatalog = JSON.parse(objectiveSource) as {
    objectives: Array<{ id: string }>;
  };
  const knownObjectiveIds = new Set(objectiveCatalog.objectives.map((objective) => objective.id));
  const expectedObjectiveIds = [...challenge.learningObjectives].sort((left, right) =>
    left.localeCompare(right),
  );

  assert.equal(challenge.mode, "challenge");
  assert.equal(challenge.id, "data-classification-ai-usage.challenge");
  assert.ok(expectedObjectiveIds.length > 0);
  for (const objectiveId of expectedObjectiveIds) {
    assert.ok(
      knownObjectiveIds.has(objectiveId),
      `unknown Classification objective ${objectiveId}`,
    );
  }

  const util = resolverUtil();
  const sessionResolver = compileResolver(sessionSource, { util });
  const stash: Record<string, unknown> = {};
  const issueContext = {
    identity: {
      sub: "classification-user",
      groups: ["role:learner", "tenant:classification-tenant"],
    },
    args: { scenarioId: challenge.id },
    stash,
  };

  const sessionRequest = sessionResolver.request(issueContext);
  assert.equal(sessionRequest["operation"], "GetItem");
  assert.equal(sessionRequest["consistentRead"], true);

  const startedAt = Date.UTC(2026, 7, 18, 14, 0);
  const finishedAt = Date.UTC(2026, 7, 18, 14, 30);
  const sourceRevision = 17;
  const sessionId = "classification-session-17";
  sessionResolver.response({
    ...issueContext,
    result: {
      tenantId: "classification-tenant",
      userId: "classification-user",
      scenarioId: challenge.id,
      mode: "challenge",
      revision: sourceRevision,
      payload: {
        id: sessionId,
        scenarioId: challenge.id,
        mode: "challenge",
        startedAt,
        finishedAt,
        challengeOutcome: "passed",
      },
    },
  });

  const attestationContext = stash["attestationContext"] as Record<string, unknown>;
  assert.equal(attestationContext["scenarioId"], challenge.id);
  assert.equal(attestationContext["scenarioVersion"], "1");
  assert.equal(attestationContext["productId"], challenge.environment.productId);
  assert.equal(attestationContext["productVersion"], challenge.environment.version);
  assert.deepEqual(
    Array.from(attestationContext["learningObjectiveIds"] as string[]),
    expectedObjectiveIds,
  );
  assert.equal(attestationContext["challengeOutcome"], "passed");

  const runResolver = compileResolver(runSource, { util });
  const runRequest = runResolver.request({ stash });
  const scenarioRunId = String(attestationContext["scenarioRunId"]);
  assert.equal((runRequest["key"] as Record<string, unknown>)["id"], scenarioRunId);
  runResolver.response({
    stash,
    result: {
      id: scenarioRunId,
      tenantId: "classification-tenant",
      userId: "classification-user",
      scenarioId: challenge.id,
      scenarioVersion: "1",
      sessionId,
      mode: "challenge",
      sourceRevision,
      evidenceEligible: true,
      evidenceStatus: "eligible",
    },
  });

  const writeResolver = compileResolver(writeSource, {
    util,
    runtime: {
      earlyReturn(): never {
        return assert.fail("eligible Classification challenge must not skip attestation creation");
      },
    },
  });
  const writeRequest = writeResolver.request({ stash });
  assert.equal(writeRequest["operation"], "PutItem");
  const key = writeRequest["key"] as Record<string, unknown>;
  const values = writeRequest["attributeValues"] as Record<string, unknown>;
  assert.equal(values["scenarioId"], challenge.id);
  assert.equal(values["scenarioVersion"], "1");
  assert.equal(values["productId"], challenge.environment.productId);
  assert.equal(values["productVersion"], challenge.environment.version);
  assert.deepEqual(Array.from(values["learningObjectiveIds"] as string[]), expectedObjectiveIds);

  const result = writeResolver.response({
    stash,
    result: { id: key["id"], ...values },
  }) as Record<string, unknown>;
  assert.equal(result["created"], true);
  assert.equal(result["reason"], "issued");
  const attestation = result["attestation"] as Record<string, unknown>;
  assert.equal(attestation["scenarioId"], challenge.id);
  assert.deepEqual(
    Array.from(attestation["learningObjectiveIds"] as string[]),
    expectedObjectiveIds,
  );
  const evidence = attestation["evidence"] as Record<string, unknown>;
  assert.equal(evidence["challengeOutcome"], "passed");
  assert.equal(evidence["evidenceStatus"], "eligible");
  assert.deepEqual(Array.from(evidence["learningObjectiveIds"] as string[]), expectedObjectiveIds);
});
