import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.argv[2];
if (!root) throw new Error("Provide Playwright output directory");

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(path)));
    else if (entry.name.endsWith("-samples.json")) files.push(path);
  }
  return files;
}

const files = await collect(root);
if (files.length !== 3) throw new Error("Expected three performance profiles");
const summaries = [];
for (const file of files) {
  const data = JSON.parse(await readFile(file, "utf8"));
  if (data.artifactSha !== process.env.PERF_ARTIFACT_SHA || data.runs.length !== 3) {
    throw new Error("Missing or wrong-SHA performance evidence");
  }
  const routes = data.runs[0].routes.map((row) => row.route);
  for (const route of routes) {
    const points = data.runs.map((run) => run.routes.find((row) => row.route === route));
    if (points.some((row) => !row || !Number.isFinite(row.lcpMs) || row.lcpMs <= 0)) {
      throw new Error("Missing LCP measurement on " + route);
    }
    const sorted = points.map((row) => row.readyMs).sort((a, b) => a - b);
    summaries.push({
      profile: data.profile.name,
      route,
      readyMedianMs: sorted[1],
      lcpMedianMs: points.map((row) => row.lcpMs).sort((a, b) => a - b)[1],
      maxFrameGapMs: Math.max(...points.map((row) => row.frameGapMaxMs)),
      maxLongTaskMs: Math.max(...points.map((row) => row.longTaskMaxMs)),
    });
  }
}
const result = {
  artifactSha: process.env.PERF_ARTIFACT_SHA,
  syntheticOnly: true,
  fieldEvidence: false,
  budgetStatus: "PENDING_PLAN_APPROVAL",
  summaries,
};
await writeFile(join(root, "performance-summary.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
