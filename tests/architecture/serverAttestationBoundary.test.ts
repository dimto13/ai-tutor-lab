import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const resourceUrl = new URL("../../amplify/data/resource.ts", import.meta.url);
const loadSessionUrl = new URL(
  "../../amplify/data/issue-attestation-load-session.generated.js",
  import.meta.url,
);
const loadRunUrl = new URL("../../amplify/data/issue-attestation-load-run.js", import.meta.url);
const writeUrl = new URL("../../amplify/data/issue-attestation-write.js", import.meta.url);
const listUrl = new URL("../../amplify/data/list-attestations.js", import.meta.url);
const exportUrl = new URL("../../amplify/data/export-attestation.js", import.meta.url);
const adapterUrl = new URL(
  "../../apps/web/src/attestations/adapters/amplifyAttestationService.ts",
  import.meta.url,
);
const hookUrl = new URL("../../apps/web/src/scoring/useScenarioScoreAward.ts", import.meta.url);
const domainUrl = new URL("../../packages/training-engine/src/attestation.ts", import.meta.url);
const generatorUrl = new URL(
  "../../scripts/generate-appsync-scenario-authority.mjs",
  import.meta.url,
);

function schemaMemberBlock(source: string, memberName: string): string {
  const startMarker = `  ${memberName}:`;
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing schema marker ${startMarker}`);
  const remainder = source.slice(start + startMarker.length);
  const nextDefinition = remainder.search(/\n {2}[A-Za-z][A-Za-z0-9]*:/);
  const schemaEnd = source.indexOf("\n});", start + startMarker.length);
  assert.notEqual(schemaEnd, -1, "Missing Amplify schema terminator");
  const end = nextDefinition >= 0 ? start + startMarker.length + nextDefinition : schemaEnd;
  return source.slice(start, end);
}

function argumentsBlock(source: string, memberName: string): string {
  const block = schemaMemberBlock(source, memberName);
  const start = block.indexOf(".arguments({");
  const end = block.indexOf(".returns(");
  assert.ok(start >= 0 && end > start, `${memberName} must define arguments before return type`);
  return block.slice(start, end);
}

test("Attestation is server-owned, versioned and indexed without generated CRUD", async () => {
  const source = await readFile(resourceUrl, "utf8");
  const block = schemaMemberBlock(source, "Attestation");

  for (const requiredField of [
    "ownerKey",
    "tenantId",
    "userId",
    "scenarioId",
    "scenarioVersion",
    "productId",
    "productVersion",
    "issuedAt",
    "validUntil",
    "sourceRevision",
    "scenarioRunId",
    "sessionId",
    "evidence",
    "provenance",
    "signingStatus",
    "appendToken",
  ]) {
    assert.match(block, new RegExp(`${requiredField}:\\s*a\\.`), `${requiredField} must be persisted`);
  }
  assert.match(block, /learningObjectiveIds:\s*a\.string\(\)\.array\(\)\.required\(\)/);
  assert.match(block, /name\(["']attestationsByOwnerTime["']\)/);
  assert.match(
    block,
    /\.disableOperations\(\s*\[\s*["']queries["']\s*,\s*["']mutations["']\s*,\s*["']subscriptions["']\s*\]\s*\)/,
  );
  assert.match(block, /allow\.authenticated\(\)/);
});

test("public attestation issuance cannot inject owner, objectives, versions, evidence or validity", async () => {
  const source = await readFile(resourceUrl, "utf8");
  const issueBlock = schemaMemberBlock(source, "issueChallengeAttestation");
  const args = argumentsBlock(source, "issueChallengeAttestation");

  assert.match(args, /scenarioId:\s*a\.string\(\)\.required\(\)/);
  for (const forbidden of [
    "tenantId",
    "userId",
    "learningObjective",
    "scenarioVersion",
    "productId",
    "productVersion",
    "evidence",
    "validUntil",
    "issuedAt",
    "sourceRevision",
    "signature",
  ]) {
    assert.doesNotMatch(args, new RegExp(forbidden, "i"), `${forbidden} must remain server-owned`);
  }
  assert.match(issueBlock, /issue-attestation-load-session\.generated\.js/);
  assert.match(issueBlock, /issue-attestation-load-run\.js/);
  assert.match(issueBlock, /issue-attestation-write\.js/);
  assert.ok(
    issueBlock.indexOf("issue-attestation-load-session.generated.js") <
      issueBlock.indexOf("issue-attestation-load-run.js"),
  );
  assert.ok(
    issueBlock.indexOf("issue-attestation-load-run.js") <
      issueBlock.indexOf("issue-attestation-write.js"),
  );
});

test("challenge and ScenarioRun evidence are re-used rather than re-scored", async () => {
  const [loadSession, loadRun, write] = await Promise.all([
    readFile(loadSessionUrl, "utf8"),
    readFile(loadRunUrl, "utf8"),
    readFile(writeUrl, "utf8"),
  ]);

  assert.match(loadSession, /identity\.sub/);
  assert.match(loadSession, /group\.startsWith\(["']tenant:["']\)/);
  assert.match(loadSession, /payload\.challengeOutcome\s*!==\s*["']passed["']/);
  assert.match(loadSession, /payload\.finishedAt/);
  assert.match(loadSession, /payload\.startedAt/);
  assert.match(loadSession, /definition\.learningObjectiveIds/);
  assert.match(loadSession, /definition\.scenarioVersion/);
  assert.match(loadSession, /definition\.productVersion/);
  assert.doesNotMatch(loadSession, /ctx\.args\.(tenantId|userId|learningObjective|scenarioVersion|product)/);

  assert.match(loadRun, /operation:\s*["']GetItem["']/);
  assert.match(loadRun, /consistentRead:\s*true/);
  assert.match(loadRun, /run\.tenantId\s*!==\s*subject\.storageTenantId/);
  assert.match(loadRun, /run\.userId\s*!==\s*subject\.userId/);
  assert.match(loadRun, /run\.sourceRevision\s*!==\s*context\.sourceRevision/);
  assert.match(loadRun, /run\.mode\s*!==\s*["']challenge["']/);

  assert.match(write, /run\.evidenceEligible\s*!==\s*true/);
  assert.match(write, /run\.evidenceStatus\s*!==\s*["']eligible["']/);
  assert.match(write, /run_not_evidence_eligible/);
  assert.match(write, /runtime\.earlyReturn/);
  assert.doesNotMatch(write, /fastRunThreshold|durationMs\s*</);
  assert.doesNotMatch(write, /points|modeMultiplier|SCORE_/);
});

test("attestation write is idempotent and records twelve-month validity plus audit provenance", async () => {
  const write = await readFile(writeUrl, "utf8");

  assert.match(write, /["']attestation:v2["']/);
  assert.match(write, /context\.scenarioRunId/);
  assert.match(write, /context\.scenarioVersion/);
  assert.match(write, /context\.productVersion/);
  assert.match(write, /context\.learningObjectiveIds/);
  assert.match(write, /attribute_not_exists\(id\)/);
  assert.match(write, /equalsIgnore/);
  assert.match(write, /const targetYear = year \+ 1/);
  assert.match(write, /validUntilIso\(issuedIso\)/);
  assert.match(write, /type:\s*["']authoritative-challenge-run["']/);
  assert.match(write, /scenarioRunId:\s*context\.scenarioRunId/);
  assert.match(write, /sourceRevision:\s*context\.sourceRevision/);
  assert.match(write, /learningObjectiveIds/);
});

test("owner-scoped list/export operations cannot accept a foreign tenant or user scope", async () => {
  const [resource, listSource, exportSource, adapterSource] = await Promise.all([
    readFile(resourceUrl, "utf8"),
    readFile(listUrl, "utf8"),
    readFile(exportUrl, "utf8"),
    readFile(adapterUrl, "utf8"),
  ]);

  const listArgs = argumentsBlock(resource, "listMyAttestations");
  assert.doesNotMatch(listArgs, /tenantId|userId/);
  assert.match(listSource, /identity\.sub/);
  assert.match(listSource, /index:\s*["']attestationsByOwnerTime["']/);
  assert.doesNotMatch(listSource, /operation:\s*["']Scan["']/);
  assert.match(listSource, /row\.tenantId\s*!==\s*caller\.storageTenantId/);
  assert.match(listSource, /row\.userId\s*!==\s*caller\.userId/);

  const exportArgs = argumentsBlock(resource, "exportMyAttestation");
  assert.match(exportArgs, /attestationId:\s*a\.id\(\)\.required\(\)/);
  assert.match(exportArgs, /format:\s*a\.ref\(["']AttestationExportFormat["']\)\.required\(\)/);
  assert.doesNotMatch(exportArgs, /tenantId|userId|evidence|productVersion|learningObjective/);
  assert.match(exportSource, /row\.tenantId\s*!==\s*subject\.storageTenantId/);
  assert.match(exportSource, /row\.userId\s*!==\s*subject\.userId/);
  assert.match(exportSource, /util\.unauthorized\(\)/);

  const mutationStart = adapterSource.indexOf("client.mutations.issueChallengeAttestation({");
  assert.notEqual(mutationStart, -1);
  const mutationEnd = adapterSource.indexOf("});", mutationStart);
  const mutation = adapterSource.slice(mutationStart, mutationEnd);
  assert.match(mutation, /scenarioId:\s*request\.scenarioId/);
  assert.doesNotMatch(mutation, /tenantId|userId|learningObjective|scenarioVersion|productVersion|evidence/);
});

test("expired attestations stay queryable and produce a recertification recommendation", async () => {
  const listSource = await readFile(listUrl, "utf8");
  assert.match(listSource, /now\s*>=\s*row\.validUntil/);
  assert.match(listSource, /validityStatus:\s*expired\s*\?\s*["']expired["']\s*:\s*["']valid["']/);
  assert.match(listSource, /recertificationRecommended:\s*expired/);
  assert.doesNotMatch(listSource, /DeleteItem|validUntil\s*<\s*now.*filter/);
});

test("PDF and CSV exports are built from the same authoritative row and signing state", async () => {
  const source = await readFile(exportUrl, "utf8");
  assert.match(source, /%PDF-1\.4/);
  assert.match(source, /xref/);
  assert.match(source, /trailer/);
  assert.match(source, /attestation_id/);
  assert.match(source, /learning_objective_ids/);
  assert.match(source, /evidence_json/);
  assert.match(source, /provenance_json/);
  assert.match(source, /signing_status/);
  assert.match(source, /row\.scenarioId/);
  assert.match(source, /row\.scenarioVersion/);
  assert.match(source, /row\.productVersion/);
  assert.match(source, /row\.learningObjectiveIds/);
  assert.match(source, /row\.evidence/);
  assert.match(source, /row\.provenance/);
  assert.match(source, /util\.base64Encode\(content\)/);
});

test("cryptographic signing is an explicit external boundary, never Base64 or a signature image", async () => {
  const [domainSource, writeSource, exportSource] = await Promise.all([
    readFile(domainUrl, "utf8"),
    readFile(writeUrl, "utf8"),
    readFile(exportUrl, "utf8"),
  ]);
  assert.match(domainSource, /export interface AttestationSigner/);
  assert.match(domainSource, /real asymmetric\/MAC signature/);
  assert.match(domainSource, /Base64/);
  assert.match(writeSource, /signingStatus:\s*["']external_signature_required["']/);
  assert.match(exportSource, /External cryptographic signature required/);
  assert.doesNotMatch(writeSource, /base64Encode\([^)]*signature/i);
  assert.doesNotMatch(exportSource, /signatureImage|drawnSignature/i);
});

test("generic attestation implementation contains no module-specific classification path", async () => {
  const sources = await Promise.all(
    [domainUrl, generatorUrl, loadRunUrl, writeUrl, listUrl, exportUrl, adapterUrl, hookUrl].map((url) =>
      readFile(url, "utf8"),
    ),
  );
  for (const source of sources) assert.doesNotMatch(source, /classification/i);
});
