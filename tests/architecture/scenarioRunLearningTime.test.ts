import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

// #582: a run stores the learning time the session measured. `durationMs` stays the wall-clock
// difference, because the fast-run evidence is defined on it.

const writeRunUrl = new URL("../../amplify/data/award-score-write-run.js", import.meta.url);
const listRunsUrl = new URL("../../amplify/data/list-scenario-runs.js", import.meta.url);

type Resolver = {
  request: (ctx: Record<string, unknown>) => Record<string, unknown>;
  response: (ctx: Record<string, unknown>) => unknown;
};

const util = {
  unauthorized(): never {
    throw new Error("Unauthorized");
  },
  error(message: string, type?: string): never {
    throw new Error(`${type ?? "ResolverError"}: ${message}`);
  },
  base64Encode: (value: string) => Buffer.from(value, "utf8").toString("base64"),
  autoId: () => "token-1",
  dynamodb: { toMapValues: (value: Record<string, unknown>) => value },
};

async function compileResolver(url: URL): Promise<Resolver> {
  let source = (await readFile(url, "utf8")).replace(/^import[^\n]*\n/m, "");
  source = source.replace(/export function /g, "function ");
  source += "\nglobalThis.__resolver = { request, response };";
  const sandbox: Record<string, unknown> = { util };
  runInNewContext(source, sandbox, { filename: url.pathname });
  return sandbox["__resolver"] as Resolver;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function writeRunContext(payload: Record<string, unknown>) {
  return {
    args: { scenarioId: "vscode-basics.guided", mode: "guided" },
    stash: {
      scoreSubject: { userId: "user-a", tenantId: "tenant-a", storageTenantId: "tenant-a" },
      scoreSession: { payload: { id: "session-a", ...payload }, revision: 4 },
    },
  };
}

async function writtenRun(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resolver = await compileResolver(writeRunUrl);
  const request = resolver.request(writeRunContext(payload));
  return request["attributeValues"] as Record<string, unknown>;
}

test("a run stores the measured learning time next to the wall-clock duration", async () => {
  const run = await writtenRun({ startedAt: 0, finishedAt: 21 * HOUR, activeMs: 14 * MINUTE });
  assert.equal(run["durationMs"], 21 * HOUR);
  assert.equal(run["activeDurationMs"], 14 * MINUTE);
  assert.equal(run["evidenceStatus"], "eligible");
});

test("learning time never exceeds the wall-clock duration", async () => {
  const run = await writtenRun({ startedAt: 0, finishedAt: 10 * MINUTE, activeMs: 3 * HOUR });
  assert.equal(run["activeDurationMs"], 10 * MINUTE);
});

test("a session without measured learning time stores none", async () => {
  for (const activeMs of [undefined, null, -1, "600000", Number.NaN]) {
    const run = await writtenRun({ startedAt: 0, finishedAt: 20 * MINUTE, activeMs });
    assert.equal("activeDurationMs" in run, false, String(activeMs));
  }
});

test("the fast-run evidence keeps using the wall-clock duration", async () => {
  // 14 estimated minutes x 0.25 = 3.5 minutes threshold.
  const fast = await writtenRun({ startedAt: 0, finishedAt: 2 * MINUTE, activeMs: 2 * MINUTE });
  assert.equal(fast["evidenceStatus"], "suspect_fast");
  const slowButIdle = await writtenRun({ startedAt: 0, finishedAt: 5 * HOUR, activeMs: MINUTE });
  assert.equal(slowButIdle["evidenceStatus"], "eligible");
});

test("the run listing passes the learning time on and reports unmeasured runs as null", async () => {
  const resolver = await compileResolver(listRunsUrl);
  const base = {
    tenantId: "tenant-a",
    userId: "user-a",
    scenarioId: "vscode-basics.guided",
    mode: "guided",
    startedAt: 0,
    finishedAt: 21 * HOUR,
    durationMs: 21 * HOUR,
  };
  const runs = resolver.response({
    stash: { runSubject: { tenantId: "tenant-a", userId: "user-a" } },
    result: {
      items: [
        { ...base, id: "measured", activeDurationMs: 14 * MINUTE },
        { ...base, id: "legacy" },
      ],
    },
  }) as Array<Record<string, unknown>>;

  assert.equal(runs[0]?.["activeDurationMs"], 14 * MINUTE);
  assert.equal(runs[1]?.["activeDurationMs"], null);
});
