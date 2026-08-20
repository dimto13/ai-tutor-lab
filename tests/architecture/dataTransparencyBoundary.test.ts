import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const resourceUrl = new URL("../../amplify/data/resource.ts", import.meta.url);
const backendUrl = new URL("../../amplify/backend.ts", import.meta.url);
const handlerUrl = new URL("../../amplify/functions/user-data-export/handler.js", import.meta.url);
const accountMenuUrl = new URL("../../apps/web/src/auth/AccountMenu.tsx", import.meta.url);
const routeUrl = new URL("../../apps/web/src/routes/datentransparenz.tsx", import.meta.url);
const clientUrl = new URL(
  "../../apps/web/src/data-transparency/userDataTransparency.ts",
  import.meta.url,
);

function definitionBlock(source: string, name: string): string {
  const start = source.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `${name} must exist in Amplify Data schema`);
  const remainder = source.slice(start + name.length + 3);
  const nextDefinition = remainder.search(/\n {2}[A-Za-z][A-Za-z0-9]*:/);
  const end =
    nextDefinition >= 0 ? start + name.length + 3 + nextDefinition : source.indexOf("\n});", start);
  return source.slice(start, end >= 0 ? end : source.length);
}

test("data transparency is a fixed account-accessible platform route", async () => {
  const [accountMenu, route] = await Promise.all([
    readFile(accountMenuUrl, "utf8"),
    readFile(routeUrl, "utf8"),
  ]);

  assert.match(accountMenu, /href=["']\/datentransparenz["']/);
  assert.match(accountMenu, /Diese Daten werden über mich gespeichert/);
  assert.match(route, /createFileRoute\(["']\/datentransparenz["']\)/);
  assert.match(route, /Was wird gespeichert\?/);
  assert.match(route, /Wer kann es sehen\?/);
  assert.match(route, /Aufbewahrung \/ Löschung/);
  assert.match(route, /data-testid=["']data-transparency-categories["']/);
});

test("transparency catalog covers actual personal data classes and keeps policies distinct", async () => {
  const source = await readFile(clientUrl, "utf8");

  for (const category of [
    "Kontoprofil",
    "Lernpräferenzen und Barrierefreiheit",
    "Trainingsfortschritt und Runtime-Zustand",
    "Punkte und Kompetenzprofil",
    "Kompetenznachweise",
    "Nutzungs- und Lerntelemetrie",
    "Produktfeedback",
    "Nur vorübergehend verarbeitete Daten",
  ]) {
    assert.match(source, new RegExp(category));
  }

  assert.match(source, /Kohorten unter 5 Personen werden serverseitig vollständig unterdrückt/);
  assert.match(source, /namentliche Auswertung ist nur für Tenant-Admins möglich/);
  assert.match(source, /weniger als 3 gestarteten Sessions werden Detailmetriken unterdrückt/);
  assert.match(source, /fachliche Nachweisgültigkeit beträgt 12 Monate\. Das ist keine Löschfrist/);
  assert.match(source, /keine separate automatische Löschfrist/);
  assert.match(source, /Rohtelemetrie hat eine serverseitige TTL/);
  assert.match(source, /Kompetenzprofil wird daraus serverseitig berechnet/);
  assert.match(source, /keine parallele authoritative Punkte-Persistenz/);
  assert.doesNotMatch(source, /ScoreEvents.*90 Tage/);
  assert.doesNotMatch(source, /Kompetenznachweis.*90 Tage/);
});

test("local-only and server storage are labeled explicitly instead of being conflated", async () => {
  const source = await readFile(clientUrl, "utf8");

  assert.match(source, /export type DataStorageMode = ["']browser-local["'] \| ["']cloud["']/);
  assert.match(source, /VITE_AUTH_MODE/);
  assert.match(source, /AWS-Cloud im bestehenden UserProfile-Pfad/);
  assert.match(source, /Nur im Browser des lokalen Entwicklungsmodus/);
  assert.match(source, /Browser-localStorage im bestehenden Feedback-Speicher/);
  assert.match(source, /nicht zuverlässig einer angemeldeten Person zugeordnet/);
  assert.match(source, /Zugangstokens werden ausdrücklich nicht in den Eigendatenexport aufgenommen/);
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
    assert.doesNotMatch(block, /\.arguments\(/);
    assert.doesNotMatch(block, /allow\.groups/);
  }

  assert.match(handler, /identity\?\.claims\?\.sub/);
  assert.match(handler, /Tenant membership is required for user data export/);
  assert.match(handler, /does not accept client-authoritative subject arguments/);
  assert.match(handler, /Multiple tenant memberships require explicit tenant selection/);
  assert.doesNotMatch(handler, /event\?\.arguments\?\.userId/);
  assert.doesNotMatch(handler, /event\?\.arguments\?\.tenantId/);
});

test("export worker has read-only access, uses only active persistence and reuses telemetry pointers", async () => {
  const [backend, handler] = await Promise.all([
    readFile(backendUrl, "utf8"),
    readFile(handlerUrl, "utf8"),
  ]);

  assert.match(backend, /table\.grantReadData\(userDataExportLambda\)/);
  assert.match(backend, /rawTelemetryTable\.grantReadData\(userDataExportLambda\)/);
  assert.match(backend, /deletionPointerTable\.grantReadData\(userDataExportLambda\)/);
  assert.doesNotMatch(backend, /grantReadWriteData\(userDataExportLambda\)/);
  assert.doesNotMatch(handler, /STEP_STATE_TABLE_NAME/);
  assert.doesNotMatch(handler, /HINT_USAGE_TABLE_NAME/);
  assert.doesNotMatch(handler, /ATTEMPT_TABLE_NAME/);
  assert.doesNotMatch(handler, /SKILL_PROFILE_TABLE_NAME/);
  assert.match(handler, /telemetry-deletion-owner:v1/);
  assert.match(handler, /Telemetry export query escaped authenticated subject scope/);
  assert.match(handler, /User data export scan escaped authenticated subject scope/);
  assert.match(handler, /Tenant aggregates are not person-specific own data/);
  assert.match(handler, /Transient authentication credentials are never exported/);
});
