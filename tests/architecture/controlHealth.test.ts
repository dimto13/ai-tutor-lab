import assert from "node:assert/strict";
import test from "node:test";
import {
  assignmentViolations,
  collectHealth,
  evaluateMainGate,
  parseJsonLines,
} from "../../scripts/control-health.mjs";

const run = {
  id: 12,
  head_sha: "current",
  head_branch: "main",
  event: "push",
  status: "completed",
  conclusion: "success",
  run_attempt: 2,
};
const jobs = ["validate", "e2e-training-modes", "e2e-production-artifact"].map((name) => ({
  name,
  run_id: 12,
  run_attempt: 2,
  status: "completed",
  conclusion: "success",
}));

test("main evidence rejects another SHA, branch, or event", () => {
  for (const change of [
    { head_sha: "old" },
    { head_branch: "deploy" },
    { event: "pull_request" },
  ]) {
    assert.equal(evaluateMainGate("current", [{ ...run, ...change }], jobs).green, false);
  }
  assert.equal(evaluateMainGate("current", [run], jobs).green, true);
});

test("a newer failed run or current failed attempt never borrows old green evidence", () => {
  assert.equal(
    evaluateMainGate("current", [run, { ...run, id: 13, conclusion: "failure" }], jobs).green,
    false,
  );
  assert.equal(evaluateMainGate("current", [{ ...run, run_attempt: 3 }], jobs).green, false);
});

test("missing Main-Push-CI retains all required job fields without granting green", () => {
  const gate = evaluateMainGate("current", [], []);
  assert.equal(gate.green, false);
  assert.equal(gate.runId, null);
  assert.equal(gate.status, "missing");
  assert.equal(gate.jobs.length, 3);
  assert.ok(gate.jobs.every((job) => job.status === "missing"));
});

test("paginated JSON tolerates empty page separators but rejects corrupt evidence", () => {
  assert.deepEqual(parseJsonLines('\n {"number":1}\n\n {"number":2}\n '), [
    { number: 1 },
    { number: 2 },
  ]);
  assert.deepEqual(parseJsonLines("\n\n"), []);
  assert.throws(() => parseJsonLines('{"number":1}\ninvalid'));
});

test("all required jobs must be unique, completed and successful in the current attempt", () => {
  for (const conclusion of ["failure", "cancelled", "skipped", "timed_out", null]) {
    assert.equal(
      evaluateMainGate("current", [run], [{ ...jobs[0], conclusion }, ...jobs.slice(1)]).green,
      false,
    );
  }
  assert.equal(evaluateMainGate("current", [run], jobs.slice(1)).green, false);
  assert.equal(evaluateMainGate("current", [run], [...jobs, jobs[0]]).green, false);
  assert.equal(evaluateMainGate("current", [{ ...run, status: "in_progress" }], jobs).green, false);
});

test("must and beta issues require one assignment, while controls and PRs are exempt", () => {
  const item = (number, labels) => ({ number, labels: labels.map((name) => ({ name })) });
  assert.deepEqual(
    assignmentViolations([
      item(1, ["prio: must"]),
      item(2, ["beta:gate", "stream:chat1", "work:parked"]),
      item(3, ["prio: must", "stream:owner"]),
      item(4, ["prio: must", "control:active"]),
      { ...item(5, ["prio: must"]), pull_request: {} },
    ]),
    [
      { number: 1, assignments: [] },
      { number: 2, assignments: ["stream:chat1", "work:parked"] },
    ],
  );
});

test("zero or multiple CONTROLs fail before any follow-up API request", async () => {
  for (const controls of [[], [{ number: 1 }, { number: 2 }]]) {
    let calls = 0;
    await assert.rejects(
      collectHealth(async () => {
        calls += 1;
        return controls;
      }),
      /CONTROL_COUNT/,
    );
    assert.equal(calls, 1);
  }
});

test("an API failure is an incomplete inspection, never a healthy idle state", async () => {
  await assert.rejects(
    collectHealth(async () => {
      throw new Error("API unavailable");
    }),
    /API unavailable/,
  );
});

test("a complete snapshot uses the exact attempt jobs and detects main movement", async () => {
  for (const moved of [false, true]) {
    let mainReads = 0;
    const calls: string[][] = [];
    const read = async (args: string[]) => {
      calls.push(args);
      if (args[0] === "issue") return [{ number: 123, body: "current", url: "control-url" }];
      if (args[0] === "pr") return [];
      const endpoint = args.find((argument) => argument.startsWith("repos/")) ?? "";
      if (endpoint.endsWith("branches/main")) {
        mainReads += 1;
        return { commit: { sha: moved && mainReads === 2 ? "new" : "current" } };
      }
      if (endpoint.endsWith("branches/deploy")) return { commit: { sha: "release" } };
      if (endpoint.includes("/issues?")) return [];
      if (endpoint.endsWith("code-ci.yml/runs")) return { workflow_runs: [run] };
      if (endpoint.includes("/attempts/2/jobs?")) return jobs;
      throw new Error(`Unexpected endpoint: ${endpoint}`);
    };
    if (moved) {
      await assert.rejects(collectHealth(read), /MAIN_MOVED_DURING_INSPECTION/);
    } else {
      const report = await collectHealth(read);
      assert.equal(report.inspectionComplete, true);
      assert.equal(report.projectGatesGreen, true);
      assert.equal(report.mainSha, "current");
      assert.equal(report.deploySha, "release");
      assert.equal(report.control.number, 123);
    }
    assert.ok(
      calls.some((args) => args.includes("event=push") && args.includes("head_sha=current")),
    );
    assert.ok(calls.some((args) => args.includes("--paginate") && args.includes(".jobs[]")));
  }
});
