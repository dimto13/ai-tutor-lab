import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const authResourceUrl = new URL("../../amplify/auth/resource.ts", import.meta.url);
const dataResourceUrl = new URL("../../amplify/data/resource.ts", import.meta.url);
const reportingResolverUrl = new URL(
  "../../amplify/data/load-tenant-reporting-context.js",
  import.meta.url,
);
const cognitoAdapterUrl = new URL(
  "../../apps/web/src/auth/adapters/cognitoAuthService.ts",
  import.meta.url,
);
const rolePolicyUrl = new URL("../../apps/web/src/auth/roles.ts", import.meta.url);

const roleGroups = ["role:learner", "role:author", "role:trainer", "role:tenant_admin"] as const;

function definitionBlock(source: string, name: string): string {
  const start = source.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `${name} must exist in Amplify Data schema`);
  const remainder = source.slice(start + name.length + 3);
  const nextDefinition = remainder.search(/\n  [A-Za-z][A-Za-z0-9]*:/);
  const end = nextDefinition >= 0 ? start + name.length + 3 + nextDefinition : source.indexOf("\n});", start);
  return source.slice(start, end >= 0 ? end : source.length);
}

test("Cognito defines the four application roles as server-managed groups", async () => {
  const source = await readFile(authResourceUrl, "utf8");

  for (const group of roleGroups) {
    assert.match(source, new RegExp(`["]${group}["]`), `${group} must be provisioned`);
  }
  assert.match(source, /groups:\s*\[/);
});

test("provider groups are normalized before they enter cloud-neutral UserIdentity", async () => {
  const adapterSource = await readFile(cognitoAdapterUrl, "utf8");
  const roleSource = await readFile(rolePolicyUrl, "utf8");

  assert.match(adapterSource, /parseApplicationRolesFromGroups\(snapshot\.roles\)/);
  assert.match(roleSource, /group\.startsWith\(roleGroupPrefix\)/);
  assert.match(roleSource, /if \(selected\.size === 0\) return \["learner"\]/);
  assert.match(roleSource, /unknown application role group/);
  assert.match(roleSource, /tenant\.reporting\.aggregate/);
  assert.match(roleSource, /tenant\.admin/);
});

test("trainer reporting entry point is protected by server-side group authorization", async () => {
  const source = await readFile(dataResourceUrl, "utf8");
  const block = definitionBlock(source, "loadTenantReportingContext");

  assert.match(block, /allow\.groups\(\["role:trainer",\s*"role:tenant_admin"\]\)/);
  assert.doesNotMatch(block, /allow\.authenticated\(\)/);
  assert.doesNotMatch(
    block,
    /\.arguments\(/,
    "tenant reporting context must accept no client scope",
  );
  assert.match(block, /entry:\s*"\.\/load-tenant-reporting-context\.js"/);
});

test("reporting resolver derives tenant and role from signed identity only", async () => {
  const source = await readFile(reportingResolverUrl, "utf8");

  assert.match(source, /identity\.sub/);
  assert.match(source, /identity\.groups/);
  assert.match(source, /TENANT_GROUP_PREFIX\s*=\s*"tenant:"/);
  assert.match(source, /ROLE_GROUP_PREFIX\s*=\s*"role:"/);
  assert.match(source, /Multiple tenant memberships require explicit tenant selection/);
  assert.match(source, /Unknown application role membership/);
  assert.match(source, /reportingRole === null\) util\.unauthorized\(\)/);
  assert.match(source, /personSpecificAttemptAccess:\s*false/);
  assert.doesNotMatch(source, /ctx\.args\.tenantId/);
  assert.doesNotMatch(source, /ctx\.args\.userId/);
});

test("trainer roles do not unlock person-specific failed-attempt records", async () => {
  const source = await readFile(dataResourceUrl, "utf8");
  const attemptBlock = definitionBlock(source, "Attempt");
  const reportingTypeBlock = definitionBlock(source, "TenantReportingContext");

  assert.match(
    attemptBlock,
    /\.disableOperations\(\s*\[\s*"queries"\s*,\s*"mutations"\s*,\s*"subscriptions"\s*\]\s*\)/,
  );
  assert.doesNotMatch(source, /dataSource:\s*a\.ref\("Attempt"\)/);
  assert.doesNotMatch(reportingTypeBlock, /userId|stepId|message|outcome/);
  assert.match(reportingTypeBlock, /personSpecificAttemptAccess:\s*a\.boolean\(\)\.required\(\)/);
});
