import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { berlinDay, cachedSkip, evaluateQuota } from "../../scripts/executor-quota.mjs";
import { parseDispatch, updateSection } from "../../scripts/executor-contract.mjs";

const now = Date.parse("2026-10-05T20:00:00Z");
const window = (usedPercent = 20, minutes = 300) => ({
  usedPercent,
  windowDurationMins: minutes,
  resetsAt: now / 1000 + 10000,
});
const quota = (short = 20, weekly = 20) => ({
  rateLimits: { limitId: "codex", primary: window(short), secondary: window(weekly, 10080) },
});

test("quota permits 100 through 50 inclusive, independently for every window", () => {
  for (const used of [0, 20, 49.9, 50])
    assert.equal(evaluateQuota(quota(used, used), now).status, "QUOTA_ALLOWED");
  for (const [short, weekly] of [
    [50.1, 0],
    [0, 50.1],
    [44, 60],
    [100, 0],
  ])
    assert.equal(evaluateQuota(quota(short, weekly), now).status, "SKIPPED_QUOTA");
  assert.equal(evaluateQuota(quota(44, 60), now).remainingPercent, 40);
});
test("every bucket is enforced; paid credits cannot override reserve", () => {
  const snapshot = {
    ...quota(),
    rateLimitsByLimitId: { codex: quota().rateLimits, other: quota(60).rateLimits },
    credits: { unlimited: true },
  };
  assert.equal(evaluateQuota(snapshot, now).status, "SKIPPED_QUOTA");
});
test("unavailable, non-numeric, expired and partial responses fail closed", () => {
  for (const value of [
    null,
    {},
    { rateLimits: {} },
    { rateLimits: { primary: window("20") } },
    { rateLimits: { primary: window(-1) } },
    { rateLimits: { primary: window(NaN) } },
    { rateLimits: { primary: { ...window(), resetsAt: now / 1000 } } },
    { rateLimits: { primary: window(), secondary: {} } },
  ])
    assert.equal(evaluateQuota(value, now).status, "SKIPPED_QUOTA_UNKNOWN");
});
test("daily skip survives quota reset time, but new Berlin day requires fresh read", () => {
  const low = evaluateQuota(quota(44, 60), now);
  assert.equal(cachedSkip(low, "codex", now + 30 * 60_000), low);
  assert.equal(cachedSkip(low, "codex", now + 30 * 60_000, true), low);
  assert.equal(cachedSkip(low, "codex", Date.parse("2026-10-05T22:01:00Z")), null);
  assert.equal(cachedSkip(low, "claude", now), null);
  assert.equal(cachedSkip(evaluateQuota(quota(), now), "codex", now), null);
  assert.equal(berlinDay(Date.parse("2026-10-05T22:00:00Z")), "2026-10-06");
});
test("unknown quota retries no earlier than 15 minutes", () => {
  const unknown = evaluateQuota(null, now);
  assert.equal(cachedSkip(unknown, "codex", now + 14 * 60_000), unknown);
  assert.equal(cachedSkip(unknown, "codex", now + 15 * 60_000), null);
  assert.equal(cachedSkip(unknown, "codex", now, true), null);
});
test("all dispatch safety metadata is mandatory; no Owner/external escalation", () => {
  const data = {
    status: "REQUESTED",
    issue: 123,
    reason: "STALLED",
    action: "IMPLEMENT",
    scope: ["apps/web/src/components/overlay/"],
    acceptance: "Regression test",
    dependencies: [],
    "basis-main": "a".repeat(40),
    merge: "forbidden",
    deploy: "forbidden",
    "self-select-work": "forbidden",
  };
  const body = (v = data) => `<!-- external-executor:v1\n${JSON.stringify(v)}\n-->`;
  assert.match(parseDispatch(body()).branch, /^owner\/123-external-/);
  assert.deepEqual(parseDispatch(body()), parseDispatch(body()));
  for (const key of [
    "reason",
    "action",
    "acceptance",
    "dependencies",
    "basis-main",
    "merge",
    "deploy",
    "self-select-work",
  ]) {
    const missing = { ...data };
    delete missing[key];
    assert.throws(() => parseDispatch(body(missing)), /INVALID_DISPATCH/);
  }
  assert.throws(
    () => parseDispatch(body({ ...data, reason: "WAIT_EXTERNAL" })),
    /INVALID_DISPATCH/,
  );
  assert.throws(() => parseDispatch(body({ ...data, merge: "allowed" })), /INVALID_DISPATCH/);
  assert.throws(
    () => parseDispatch(body({ ...data, dependencies: ["not done"] })),
    /INVALID_DISPATCH/,
  );
});
test("planner field format is supported, examples ignored, duplicate fields rejected", () => {
  const text =
    '<!-- external-executor:v1 -->\nstatus: REQUESTED\nissue: 123\nreason: EXECUTOR_CAPACITY\naction: TEST\nscope: ["tests/runtime/"]\nacceptance: full check\ndependencies: []\nbasis-main: ' +
    "a".repeat(40) +
    "\nmerge: forbidden\ndeploy: forbidden\nself-select-work: forbidden\n\n## Next\nignored";
  assert.equal(parseDispatch(text).action, "TEST");
  assert.equal(parseDispatch(`~~~text\n${text}\n~~~`), null);
  assert.throws(
    () => parseDispatch(text.replace("status: REQUESTED", "status: REQUESTED\nstatus: REQUESTED")),
    /INVALID_DISPATCH_FIELDS/,
  );
});
test("quota body status is unique and preserves dispatch and other CONTROL sections", () => {
  const original = "# CONTROL\n\n## External executor quota\nold\n## Queue\nkeep";
  const updated = updateSection(original, "External executor quota", "new");
  assert.equal(updated.split("## External executor quota").length, 2);
  assert.match(updated, /## Queue\nkeep/);
  assert.equal(updateSection(updated, "External executor quota", "new"), updated);
});
test("quota is before checkout and model, read-only endpoint only, no quota bypass", () => {
  const source = readFileSync("scripts/jenkins-local-worker.mjs", "utf8");
  const compact = source.replace(/\s+/g, "");
  assert.ok(compact.indexOf("checkQuota(stateHome)") >= 0);
  assert.ok(compact.indexOf('["clone"') >= 0);
  assert.ok(compact.indexOf("checkQuota(stateHome)") < compact.indexOf('["clone"'));
  assert.ok(compact.indexOf('awaitcommand("docker",dockerArgs(workspace,outputDir,[...args') >= 0);
  assert.ok(
    compact.indexOf("checkQuota(stateHome,true)") <
      compact.indexOf('awaitcommand("docker",dockerArgs(workspace,outputDir,[...args'),
  );
  assert.match(source, /quotaGuard: \(\) => checkQuota\(stateHome, true\)/);
  assert.match(source, /cachedSkip\(previous, provider, Date\.now\(\), force\)/);
  assert.match(source, /await quotaCheck;/);
  assert.match(source, /hostname\(\) !== "rmi"/);
  const adapter = readFileSync("scripts/executor-quota.mjs", "utf8");
  assert.match(adapter, /account\/rateLimits\/read/);
  assert.doesNotMatch(
    adapter,
    /turn\/start|thread\/start|rateLimitResetCredit\/consume|OPENAI_API_KEY/,
  );
});
