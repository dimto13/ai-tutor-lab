import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.argv[2];
const expectedSha = process.env.PERF_ARTIFACT_SHA;
if (!root) throw new Error("Provide Playwright output directory");
if (!/^[0-9a-f]{40}$/.test(expectedSha ?? "")) {
  throw new Error("PERF_ARTIFACT_SHA must be the full production artifact SHA");
}

const expectedProfiles = new Set([
  "desktop-animated",
  "constrained-animated",
  "constrained-reduced",
]);

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(path)));
    else if (entry.name.endsWith("-samples.json")) files.push(path);
  }
  return files;
}

function median(values) {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Missing or non-finite performance measurements");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function requiredMetric(row, key, route) {
  const value = row?.[key];
  if (!Number.isFinite(value) || value < 0 || (key === "lcpMs" && value === 0)) {
    throw new Error("Missing/invalid " + key + " measurement on " + route);
  }
  return value;
}

const files = await collect(root);
if (files.length !== expectedProfiles.size) {
  throw new Error("Expected one sample file for each required performance profile");
}

const summaries = [];
const seenProfiles = new Set();
for (const file of files) {
  const data = JSON.parse(await readFile(file, "utf8"));
  const profile = data.profile?.name;
  if (!expectedProfiles.has(profile) || seenProfiles.has(profile)) {
    throw new Error("Missing, duplicate or unknown performance profile: " + profile);
  }
  seenProfiles.add(profile);
  if (
    data.artifactSha !== expectedSha ||
    data.syntheticOnly !== true ||
    data.fieldEvidence !== false ||
    !Array.isArray(data.runs) ||
    data.runs.length !== 3
  ) {
    throw new Error("Missing, incomplete or wrong-SHA performance evidence: " + profile);
  }

  const routeNames = data.runs[0]?.routes?.map((row) => row.route);
  if (!Array.isArray(routeNames) || routeNames.length === 0) {
    throw new Error("No measured routes in " + profile);
  }
  if (new Set(routeNames).size !== routeNames.length) {
    throw new Error("Duplicate routes in " + profile);
  }
  for (const run of data.runs) {
    if (!Array.isArray(run.routes) || run.routes.length !== routeNames.length) {
      throw new Error("Incomplete route measurements in " + profile);
    }
    if (new Set(run.routes.map((row) => row.route)).size !== routeNames.length) {
      throw new Error("Duplicate route measurements in " + profile);
    }
  }

  for (const route of routeNames) {
    const points = data.runs.map((run) => run.routes.find((row) => row.route === route));
    if (points.some((row) => !row)) {
      throw new Error("Missing route measurement: " + profile + " / " + route);
    }
    const ready = points.map((row) => requiredMetric(row, "readyMs", route));
    const lcp = points.map((row) => requiredMetric(row, "lcpMs", route));
    const cls = points.map((row) => requiredMetric(row, "cls", route));
    const frameGaps = points.map((row) => requiredMetric(row, "frameGapMaxMs", route));
    const longTasks = points.map((row) => requiredMetric(row, "longTaskMaxMs", route));
    // Driver-inclusive input-to-paint proxy, explicitly not a field INP measurement.
    const interactions = points.map((row) =>
      requiredMetric(row, "interactionToPaintProxyMs", route),
    );
    summaries.push({
      profile,
      route,
      readyMedianMs: median(ready),
      lcpMedianMs: median(lcp),
      clsMedian: median(cls),
      maxFrameGapMs: Math.max(...frameGaps),
      maxLongTaskMs: Math.max(...longTasks),
      interactionToPaintProxyMedianMs: median(interactions),
      interactionToPaintProxyMaxMs: Math.max(...interactions),
    });
  }
}

const result = {
  artifactSha: expectedSha,
  syntheticOnly: true,
  fieldEvidence: false,
  budgetStatus: "PENDING_PLAN_APPROVAL",
  summaries,
};
await writeFile(join(root, "performance-summary.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
