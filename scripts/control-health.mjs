import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const repository = "dimto13/ai-tutor-lab";
const requiredJobs = ["validate", "e2e-training-modes", "e2e-production-artifact"];
const ownershipLabels = new Set([
  "stream:chat1",
  "stream:chat2",
  "stream:chat3",
  "stream:owner",
  "work:parked",
]);

export function evaluateMainGate(mainSha, runs, jobs) {
  const run = runs
    .filter(
      (candidate) =>
        candidate.head_sha === mainSha &&
        candidate.head_branch === "main" &&
        candidate.event === "push",
    )
    .sort((left, right) => right.id - left.id)[0];
  if (!run) {
    return {
      green: false,
      reason: "MISSING_EXACT_MAIN_PUSH_RUN",
      runId: null,
      runAttempt: null,
      url: null,
      status: "missing",
      conclusion: null,
      jobs: requiredJobs.map((name) => ({ name, status: "missing", conclusion: null })),
    };
  }

  const results = requiredJobs.map((name) => {
    const matches = jobs.filter(
      (job) => job.name === name && job.run_id === run.id && job.run_attempt === run.run_attempt,
    );
    const job = matches.length === 1 ? matches[0] : null;
    return { name, status: job?.status ?? "missing", conclusion: job?.conclusion ?? null };
  });
  const green =
    run.status === "completed" &&
    run.conclusion === "success" &&
    results.every((job) => job.status === "completed" && job.conclusion === "success");
  return {
    green,
    reason: green ? "EXACT_MAIN_PUSH_GREEN" : "MAIN_GATE_CLOSED",
    runId: run.id,
    runAttempt: run.run_attempt,
    url: run.html_url,
    status: run.status,
    conclusion: run.conclusion,
    jobs: results,
  };
}

export function assignmentViolations(issues) {
  return issues.flatMap((issue) => {
    const labels = issue.labels.map((label) => label.name);
    if (
      issue.pull_request ||
      labels.some((label) => label.startsWith("control:")) ||
      (!labels.includes("prio: must") && !labels.includes("beta:gate"))
    ) {
      return [];
    }
    const assignments = labels.filter((label) => ownershipLabels.has(label));
    return assignments.length === 1 ? [] : [{ number: issue.number, assignments }];
  });
}

export function parseJsonLines(stdout) {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function gh(args) {
  const { stdout } = await exec("gh", args, { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
  if (args.includes("--paginate")) {
    return parseJsonLines(stdout);
  }
  return JSON.parse(stdout);
}

export async function collectHealth(read = gh) {
  const controls = await read([
    "issue",
    "list",
    "--repo",
    repository,
    "--state",
    "open",
    "--label",
    "control:active",
    "--limit",
    "100",
    "--json",
    "number,body,url",
  ]);
  if (controls.length !== 1) throw new Error(`CONTROL_COUNT: expected 1, found ${controls.length}`);

  const [main, deploy, issues, prs] = await Promise.all([
    read(["api", `repos/${repository}/branches/main`]),
    read(["api", `repos/${repository}/branches/deploy`]),
    read([
      "api",
      "--paginate",
      "--jq",
      ".[]",
      `repos/${repository}/issues?state=open&per_page=100`,
    ]),
    read([
      "pr",
      "list",
      "--repo",
      repository,
      "--state",
      "open",
      "--limit",
      "100",
      "--json",
      "number,title,headRefOid,headRefName,baseRefName,isDraft,statusCheckRollup,reviewDecision,url",
    ]),
  ]);
  if (prs.length === 100) throw new Error("PR_LIST_TRUNCATED: complete inspection required");

  const mainSha = main.commit.sha;
  const response = await read([
    "api",
    "--method",
    "GET",
    `repos/${repository}/actions/workflows/code-ci.yml/runs`,
    "-f",
    "branch=main",
    "-f",
    "event=push",
    "-f",
    `head_sha=${mainSha}`,
    "-f",
    "per_page=100",
  ]);
  const matching = response.workflow_runs
    .filter((run) => run.head_sha === mainSha && run.head_branch === "main" && run.event === "push")
    .sort((left, right) => right.id - left.id);
  const latest = matching[0];
  const jobs = latest
    ? await read([
        "api",
        "--paginate",
        "--jq",
        ".jobs[]",
        `repos/${repository}/actions/runs/${latest.id}/attempts/${latest.run_attempt}/jobs?per_page=100`,
      ])
    : [];

  const pullRequests = [];
  for (let offset = 0; offset < prs.length; offset += 4) {
    const batch = await Promise.all(
      prs.slice(offset, offset + 4).map(async (pr) => {
        const compare = await read([
          "api",
          `repos/${repository}/compare/${mainSha}...${pr.headRefOid}`,
        ]);
        return {
          number: pr.number,
          title: pr.title,
          head: pr.headRefOid,
          branch: pr.headRefName,
          base: pr.baseRefName,
          draft: pr.isDraft,
          behindMain: compare.behind_by,
          reviewDecision: pr.reviewDecision,
          checks: (pr.statusCheckRollup ?? []).map((check) => ({
            name: check.name ?? check.context,
            status: check.status ?? check.state,
            conclusion: check.conclusion ?? null,
          })),
          nextAction:
            compare.behind_by > 0
              ? "Checkout executor: worker:sync, check, worker:push; then fresh CI/review"
              : pr.isDraft
                ? "Assigned executor: finish draft implementation and validation"
                : !requiredJobs.every((name) =>
                      (pr.statusCheckRollup ?? []).some(
                        (check) => check.name === name && check.conclusion === "SUCCESS",
                      ),
                    )
                  ? "Assigned executor: inspect or await all exact-head PR CI jobs before review/merge"
                  : "PLAN: inspect complete CI, reviews and threads; serialize merge through local worker:gate",
          url: pr.url,
        };
      }),
    );
    pullRequests.push(...batch);
  }
  const mainAfter = await read(["api", `repos/${repository}/branches/main`]);
  if (mainAfter.commit.sha !== mainSha)
    throw new Error("MAIN_MOVED_DURING_INSPECTION: retry required");

  const violations = assignmentViolations(issues);
  const mainGate = evaluateMainGate(mainSha, response.workflow_runs, jobs);
  const hygiene = issues
    .filter((issue) => issue.labels.some((label) => label.name === "hygiene:violation"))
    .map((issue) => issue.number);
  return {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    repository,
    inspectionComplete: true,
    projectGatesGreen: mainGate.green && violations.length === 0 && hygiene.length === 0,
    control: { number: controls[0].number, url: controls[0].url },
    checkpointContainsMain: controls[0].body.split("## Mission")[0].includes(mainSha),
    mainSha,
    deploySha: deploy.commit.sha,
    mainGate,
    assignmentViolations: violations,
    hygieneViolations: hygiene,
    ownerAssignedOpenIssues: issues
      .filter(
        (issue) =>
          !issue.pull_request && issue.labels.some((label) => label.name === "stream:owner"),
      )
      .map((issue) => issue.number),
    pullRequests,
    limitations:
      "Read-only evidence: no dispatch, review disposition, merge, deployment or cloud acceptance. " +
      "worker:doctor proves checkout prerequisites, not an active coding worker. " +
      "PR reviews/threads require PLAN inspection before merge.",
  };
}

if (
  !process.argv[1] ||
  process.argv[1] === "-" ||
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const report = await collectHealth();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.projectGatesGreen ? 0 : 2;
  } catch (error) {
    console.log(
      JSON.stringify({
        inspectionComplete: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  }
}
