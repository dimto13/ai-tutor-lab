import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.argv[2];
const expectedSha = process.env.PERF_ARTIFACT_SHA;
const expectedTarget = process.env.PERF_TARGET;
if (!root) throw new Error("Provide Playwright output directory");
if (!["local", "release"].includes(expectedTarget ?? "")) {
  throw new Error("PERF_TARGET must be local or release");
}
if (!/^[0-9a-f]{40}$/.test(expectedSha ?? "")) {
  throw new Error("PERF_ARTIFACT_SHA must be the full production artifact SHA");
}

const expectedProfiles = new Set([
  "desktop-animated",
  "constrained-animated",
  "constrained-reduced",
]);

// Route coverage is part of the evidence contract: a truncated suite must
// never produce a green summary merely because every remaining run agrees.
const expectedRoutesByTarget = {
  local: ["/willkommen", "/", "/training/vscode-basics.guided"],
  release: ["/willkommen"],
};

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
// Non-gating raw timing breakdown: retains all five landing scene actions in
// each of the three cold samples, without changing the regression comparator.
const landingSceneTimingDiagnostics = [];
// Independent, non-gating post-cold replay; never feeds baseline metrics.
const landingActionabilityReplays = [];
const seenProfiles = new Set();
for (const file of files) {
  const data = JSON.parse(await readFile(file, "utf8"));
  const profile = data.profile?.name;
  if (!expectedProfiles.has(profile) || seenProfiles.has(profile)) {
    throw new Error("Missing, duplicate or unknown performance profile: " + profile);
  }
  seenProfiles.add(profile);
  const replay = data.landingActionabilityReplay;
  if (
    replay?.status === "RECORDED" &&
    replay.actions?.length === 2 &&
    replay.actions[0]?.kind === "already-active-first-dot" &&
    replay.actions[1]?.kind === "second-dot-transition"
  ) {
    const [noOp, transition] = replay.actions;
    landingActionabilityReplays.push({
      profile,
      status: "RECORDED",
      noOp,
      transition,
      transitionMinusNoOpDriverClickMs: transition.driverClickMs - noOp.driverClickMs,
      interpretation:
        "Non-gating Playwright actionability/browser-event scheduling only; not synchronized clocks, paint or field INP",
    });
  } else {
    landingActionabilityReplays.push({
      profile,
      status: "NOT_RECORDED",
      reason: String(replay?.reason ?? "Missing or incomplete diagnostic replay").slice(0, 500),
    });
  }
  if (
    data.artifactSha !== expectedSha ||
    data.target !== expectedTarget ||
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
  const expectedRoutes = expectedRoutesByTarget[expectedTarget];
  if (
    !expectedRoutes ||
    routeNames.length !== expectedRoutes.length ||
    routeNames.some((route) => !expectedRoutes.includes(route))
  ) {
    throw new Error("Missing or unexpected required routes in " + profile + " / " + data.target);
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
    if (route === "/willkommen") {
      landingSceneTimingDiagnostics.push({
        profile,
        route,
        coldSamples: points.map((row, index) => ({
          run: data.runs[index].run,
          status:
            Array.isArray(row.landingSceneTimings) && row.landingSceneTimings.length === 5
              ? "RECORDED"
              : "NOT_RECORDED",
          scenes: row.landingSceneTimings ?? null,
        })),
      });
    }
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

/**
 * Diagnostic-only same-SHA A1/A2/A3 calibration from Performance Gate
 * run 40050642843, attempts 1/2/3, jobs 120742368996/120772778821/120785162053.
 * Source SHA 84fb6d04b7d6c3805e3766ca4476728382eb5ca0. Original cold samples, traces and full-SHA summaries
 * remain archived in artifact IDs 12543855225, 12547059040, 12549136827.
 * These three values per metric are per-attempt aggregates of three cold runs,
 * NOT replacement raw samples. Never reinterpret them as product budgets.
 */
const calibration = {
  "constrained-animated|/willkommen": {
    readyMedianMs: [11768, 11646, 10989],
    lcpMedianMs: [2236, 2200, 2188],
    clsMedian: [0.12997117308196615, 0.12947254261644556, 0.12986576296091082],
    maxFrameGapMs: [433.2999999999993, 350, 266.8000000000002],
    interactionToPaintProxyMedianMs: [5020, 4783, 5256],
  },
  "constrained-animated|/": {
    readyMedianMs: [8708, 8508, 8501],
    lcpMedianMs: [8520, 8364, 8360],
    clsMedian: [0.00037146167755126955, 0.00037146167755126955, 0.00037146167755126955],
    maxFrameGapMs: [300.09999999999945, 250, 250.10000000000036],
    interactionToPaintProxyMedianMs: [176, 89, 95],
  },
  "constrained-animated|/training/vscode-basics.guided": {
    readyMedianMs: [10910, 10632, 10677],
    lcpMedianMs: [10048, 9864, 9896],
    clsMedian: [0.0008278560638427735, 0.0008278560638427735, 0.0008278560638427735],
    maxFrameGapMs: [316.59999999999854, 249.89999999999964, 233.39999999999964],
    interactionToPaintProxyMedianMs: [240, 196, 211],
  },
  "constrained-reduced|/willkommen": {
    readyMedianMs: [8063, 7771, 7814],
    lcpMedianMs: [2204, 2164, 2172],
    clsMedian: [0.1294269749522209, 0.12986576296091082, 0.1294269749522209],
    maxFrameGapMs: [300, 233.30000000000018, 233.30000000000018],
    interactionToPaintProxyMedianMs: [4824, 4752, 4766],
  },
  "constrained-reduced|/": {
    readyMedianMs: [8675, 8470, 8498],
    lcpMedianMs: [8500, 8328, 8356],
    clsMedian: [0.00037146167755126955, 0.00037146167755126955, 0.00037146167755126955],
    maxFrameGapMs: [283.40000000000055, 250, 233.40000000000055],
    interactionToPaintProxyMedianMs: [164, 93, 81],
  },
  "constrained-reduced|/training/vscode-basics.guided": {
    readyMedianMs: [10844, 10589, 10665],
    lcpMedianMs: [10032, 9836, 9888],
    clsMedian: [0.0008278560638427735, 0.0008278560638427735, 0.0008278560638427735],
    maxFrameGapMs: [316.60000000000036, 216.60000000000036, 250],
    interactionToPaintProxyMedianMs: [218, 177, 197],
  },
  "desktop-animated|/willkommen": {
    readyMedianMs: [5894, 5282, 5301],
    lcpMedianMs: [304, 208, 204],
    clsMedian: [0.10193951339020861, 0.10192011772757398, 0.10189276448488237],
    maxFrameGapMs: [400, 216.5999999999999, 350],
    interactionToPaintProxyMedianMs: [1512, 1248, 1325],
  },
  "desktop-animated|/": {
    readyMedianMs: [396, 341, 320],
    lcpMedianMs: [332, 272, 252],
    clsMedian: [0.0005300596237182618, 0.0005300596237182618, 0.0005300596237182618],
    maxFrameGapMs: [66.70000000000002, 0, 50.10000000000001],
    interactionToPaintProxyMedianMs: [89, 72, 80],
  },
  "desktop-animated|/training/vscode-basics.guided": {
    readyMedianMs: [561, 413, 431],
    lcpMedianMs: [384, 312, 292],
    clsMedian: [0.00315205625295639, 0.00315205625295639, 0.00315205625295639],
    maxFrameGapMs: [66.60000000000002, 50.099999999999994, 50.099999999999994],
    interactionToPaintProxyMedianMs: [86, 95, 99],
  },
};
const calibratedSha = "84fb6d04b7d6c3805e3766ca4476728382eb5ca0";
const diagnosticMetrics = [
  ["lcpMedianMs", 250],
  ["clsMedian", 0.01],
  ["interactionToPaintProxyMedianMs", 250],
  ["readyMedianMs", 500],
  ["maxFrameGapMs", 100],
];
const diagnosticFailures = [];
const diagnosticResults = [];
const productTargetFailures = [];
if (expectedTarget !== "local") {
  throw new Error("No approved diagnostic calibration for target " + expectedTarget);
}
if (
  Object.keys(calibration).length !==
  expectedProfiles.size * expectedRoutesByTarget.local.length
) {
  throw new Error("Incomplete diagnostic calibration for " + calibratedSha);
}
for (const summary of summaries) {
  const key = summary.profile + "|" + summary.route;
  const reference = calibration[key];
  if (!reference) throw new Error("Missing calibrated profile/route " + key);
  const metrics = {};
  for (const [metric, minimumMargin] of diagnosticMetrics) {
    const attempts = reference[metric];
    if (
      !Array.isArray(attempts) ||
      attempts.length !== 3 ||
      attempts.some((value) => !Number.isFinite(value) || value < 0)
    ) {
      throw new Error("Missing or invalid A1/A2/A3 " + key + " " + metric);
    }
    const current = summary[metric];
    if (!Number.isFinite(current) || current < 0) {
      throw new Error("Missing or invalid current " + key + " " + metric);
    }
    const spread = Math.max(...attempts) - Math.min(...attempts);
    const margin = Math.max(minimumMargin, 2 * spread);
    const baseline = metric === "maxFrameGapMs" ? Math.max(...attempts) : median(attempts);
    const ceiling = baseline + margin;
    metrics[metric] = { current, baseline, margin, ceiling, calibrationAttempts: attempts };
    if (current > ceiling) {
      diagnosticFailures.push({
        profile: summary.profile,
        route: summary.route,
        metric,
        measured: current,
        ceiling,
        artifactSha: expectedSha,
        calibratedSha,
      });
    }
  }
  diagnosticResults.push({ profile: summary.profile, route: summary.route, metrics });
  for (const [metric, ceiling] of [
    ["lcpMedianMs", 2500],
    ["clsMedian", 0.1],
    ["maxFrameGapMs", 100],
  ]) {
    if (summary[metric] > ceiling) {
      productTargetFailures.push({
        profile: summary.profile,
        route: summary.route,
        metric,
        measured: summary[metric],
        objective: ceiling,
      });
    }
  }
}
if (diagnosticResults.length !== Object.keys(calibration).length) {
  throw new Error("Incomplete diagnostic profile/route coverage");
}

const result = {
  artifactSha: expectedSha,
  syntheticOnly: true,
  fieldEvidence: false,
  budgetStatus: productTargetFailures.length
    ? "BASELINE_REGRESSION_ONLY / PRODUCT_TARGET_FAIL"
    : "BASELINE_REGRESSION_ONLY / PRODUCT_TARGETS_NOT_EXCEEDED_SYNTHETIC_ONLY",
  calibration: { sourceSha: calibratedSha, runId: 40050642843, attempts: [1, 2, 3] },
  diagnosticRegressionStatus: diagnosticFailures.length ? "FAIL" : "PASS_SYNTHETIC_ONLY",
  diagnosticResults,
  diagnosticFailures,
  productTargetFailures,
  summaries,
  landingSceneTimingDiagnostics,
  landingActionabilityReplays,
};
await writeFile(join(root, "performance-summary.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (diagnosticFailures.length) {
  const failure = diagnosticFailures[0];
  throw new Error(
    "BASELINE_REGRESSION_FAIL " +
      failure.artifactSha +
      " " +
      failure.profile +
      " " +
      failure.route +
      " " +
      failure.metric +
      " measured=" +
      failure.measured +
      " ceiling=" +
      failure.ceiling +
      " reference=" +
      failure.calibratedSha,
  );
}
