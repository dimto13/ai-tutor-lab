import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("../../apps/web/src/routes/datentransparenz.tsx", import.meta.url);
const catalogUrl = new URL(
  "../../apps/web/src/data-transparency/userDataTransparency.ts",
  import.meta.url,
);
const amplifyAdapterUrl = new URL(
  "../../apps/web/src/persistence/adapters/amplifyDataTransparency.ts",
  import.meta.url,
);
const resourceUrl = new URL("../../amplify/data/resource.ts", import.meta.url);
const handlerUrl = new URL("../../amplify/functions/user-data-export/handler.js", import.meta.url);
const backendUrl = new URL("../../amplify/backend.ts", import.meta.url);
const authResourceUrl = new URL("../../amplify/auth/resource.ts", import.meta.url);

function definitionBlock(source: string, name: string): string {
  const start = source.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `missing definition for ${name}`);
  const remainder = source.slice(start + name.length + 3);
  const nextDefinition = remainder.search(/\n {2}[A-Za-z][A-Za-z0-9]*:/);
  const end =
    nextDefinition >= 0 ? start + name.length + 3 + nextDefinition : source.indexOf("\n});", start);
  return source.slice(start, end >= 0 ? end : source.length);
}

test("data transparency is a fixed account-accessible platform route", async () => {
  const route = await readFile(routeUrl, "utf8");

  assert.match(route, /createFileRoute\(["']\/datentransparenz["']\)/);
  assert.match(route, /Diese Daten werden über mich gespeichert/);
  assert.match(route, /downloadOwnDataExport/);
  assert.match(route, /Meine Daten als JSON exportieren/);
});

test("transparency catalog covers actual personal data classes and keeps policies distinct", async () => {
  const catalog = await readFile(catalogUrl, "utf8");

  for (const dataClass of [
    "UserProfile",
    "UserPreferences",
    "TrainingSession",
    "RuntimeSnapshot",
    "ScenarioRuns",
    "ScoreEvents",
    "Attestation",
    "Rohereignisse",
  ]) {
    assert.match(catalog, new RegExp(dataClass));
  }
  assert.match(catalog, /scoreVisibility/);
  assert.match(catalog, /rawTelemetryRetentionDays/);
});

test("local-only and server storage are labeled explicitly instead of being conflated", async () => {
  const catalog = await readFile(catalogUrl, "utf8");

  assert.match(catalog, /browser-local/);
  assert.match(catalog, /cloud/);
});

test("cloud data access stays lazy and behind the existing persistence adapter boundary", async () => {
  const catalog = await readFile(catalogUrl, "utf8");

  assert.match(
    catalog,
    /import\(["']@\/persistence\/adapters\/amplifyDataTransparency["']\)/,
  );
  assert.doesNotMatch(catalog, /aws-amplify\/api/);
});

test("tenant membership failures are mapped at the cloud adapter boundary", async () => {
  const adapter = await readFile(amplifyAdapterUrl, "utf8");

  assert.match(adapter, /isTenantMembershipFailure/);
  assert.match(adapter, /Dein Datenkontext ist noch nicht verfügbar/);
  assert.match(adapter, /providerBoundaryError\(result\.errors\)/);
  assert.doesNotMatch(adapter, /new Error\(errorText\(result\.errors\)\)/);
});

test("confirmed self-service users receive one server-managed bootstrap tenant", async () => {
  const [authResource, backend] = await Promise.all([
    readFile(authResourceUrl, "utf8"),
    readFile(backendUrl, "utf8"),
  ]);

  assert.match(authResource, /["']tenant:default["']/);
  assert.match(backend, /bootstrapTenantGroup = ["']tenant:default["']/);
  assert.match(backend, /AdminAddUserToGroupCommand/);
  assert.match(backend, /cognito-idp:AdminAddUserToGroup/);
  assert.match(backend, /cfnUserPool\.lambdaConfig/);
  assert.match(backend, /postConfirmation: tenantProvisioner\.functionArn/);
  assert.match(backend, /ServicePrincipal\(["']cognito-idp\.amazonaws\.com["']\)/);
  assert.doesNotMatch(backend, /AdminCreateUser|AdminUpdateUserAttributes/);
});

test("own-data operations are authenticated, argumentless and server-authoritative", async () => {
  const [resource, handler] = await Promise.all([
    readFile(resourceUrl, "utf8"),
    readFile(handlerUrl, "utf8"),
  ]);
  const contextBlock = definitionBlock(resource, "loadMyDataTransparencyContext");
  const exportBlock = definitionBlock(resource, "exportMyData");

  for (const block of [contextBlock, exportBlock]) {
    assert.match(block, /allow\.authenticated\(\)/);
    assert.match(block, /a\.handler\.function\(userDataExport\)/);
  }
  assert.match(handler, /event\?\.identity/);
  assert.match(handler, /identity\?\.claims\?\.sub/);
  assert.match(handler, /Tenant membership is required for user data export/);
  assert.match(handler, /does not accept client-authoritative subject arguments/);
  assert.doesNotMatch(handler, /event\?\.arguments\?\.(userId|tenantId)/);
});

test("export worker has read-only access, uses only active persistence and reuses telemetry pointers", async () => {
  const [backend, handler] = await Promise.all([
    readFile(backendUrl, "utf8"),
    readFile(handlerUrl, "utf8"),
  ]);

  assert.match(backend, /grantReadData\(userDataExportLambda\)/);
  assert.doesNotMatch(backend, /grantReadWriteData\(userDataExportLambda\)/);
  assert.match(handler, /TELEMETRY_DELETION_POINTER_TABLE_NAME/);
  assert.match(handler, /async function loadTelemetryPointers/);
  assert.match(handler, /queryDescriptor/);
  assert.match(handler, /async function batchGetRawTelemetry/);
  assert.match(handler, /batchGetDescriptor/);
});
