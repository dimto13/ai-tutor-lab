import { writeFile } from "node:fs/promises";

import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

type PerfSamples = {
  lcpMs: number;
  cls: number;
  longTasksMs: number[];
  frameGapsMs: number[];
};

declare global {
  interface Window {
    __perfSamples?: PerfSamples;
    __perfStopFrames?: () => void;
    __perfDashboardAttribution?: {
      stop: () => {
        frameGaps: DashboardInterval[];
        longTasks: DashboardInterval[];
        longTaskSupported: boolean;
      };
    };
    __perfLandingReplay?: {
      armedAt: number;
      pointerDownAt: number | null;
      clickAt: number | null;
      sceneChangeAt: number | null;
      stop: () => void;
    };
  }
}

// Diagnostic-only segments; never replace the original driver-inclusive proxy.
type LandingSceneTiming = {
  sceneIndex: number;
  driverClickMs: number;
  domExpectationMs: number;
  driverDoubleRafMs: number;
  browserDoubleRafMs: number;
  interactionToPaintProxyMs: number;
};

// Separate post-cold-sample diagnostic: neither action changes the original five
// measured scene clicks or contributes to any product/diagnostic gate.
type LandingActionabilityReplay =
  | {
      status: "RECORDED";
      actions: Array<{
        kind: "already-active-first-dot" | "second-dot-transition";
        initialScene: string | null;
        finalScene: string | null;
        driverClickMs: number;
        domExpectationMs: number;
        driverDoubleRafMs: number;
        browserDoubleRafMs: number;
        browserPointerDownAfterArmMs: number | null;
        browserClickAfterArmMs: number | null;
        browserSceneChangeAfterArmMs: number | null;
        driverInclusiveProxyMs: number;
      }>;
    }
  | { status: "NOT_RECORDED"; reason: string };

// Post-cold dashboard-only attribution; browser timestamps share one navigation clock.
type DashboardInterval = { startMs: number; endMs: number; durationMs: number };
type DashboardAttributionReplay =
  | {
      status: "RECORDED";
      frameGaps: DashboardInterval[];
      longTasks: DashboardInterval[];
      longestFrameGap: DashboardInterval | null;
      longestLongTask: DashboardInterval | null;
      overlappingIntervals: Array<{
        frameGap: DashboardInterval;
        longTask: DashboardInterval;
        overlapMs: number;
      }>;
      longestPairOverlapMs: number;
      interpretation: string;
    }
  | { status: "NOT_RECORDED"; reason: string };

type RouteSample = {
  route: string;
  readyMs: number;
  lcpMs: number;
  cls: number;
  longTaskCount: number;
  longTaskMaxMs: number;
  frameGapMaxMs: number;
  interactionToPaintProxyMs: number | null;
  landingSceneTimings?: LandingSceneTiming[];
};

const baseURL = process.env.PERF_BASE_URL;
const target = process.env.PERF_TARGET;
const artifactSha = process.env.PERF_ARTIFACT_SHA;

if (
  !baseURL ||
  !["local", "release"].includes(target ?? "") ||
  !/^[0-9a-f]{40}$/.test(artifactSha ?? "")
) {
  throw new Error(
    "PERF_BASE_URL, PERF_TARGET=local|release and full PERF_ARTIFACT_SHA are required",
  );
}

const profiles = [
  { name: "desktop-animated", reduced: false, cpu: 1, constrainedNetwork: false },
  { name: "constrained-animated", reduced: false, cpu: 4, constrainedNetwork: true },
  { name: "constrained-reduced", reduced: true, cpu: 4, constrainedNetwork: true },
] as const;

async function instrument(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const samples: PerfSamples = {
      lcpMs: 0,
      cls: 0,
      longTasksMs: [],
      frameGapsMs: [],
    };
    window.__perfSamples = samples;

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) samples.lcpMs = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // Missing browser metrics remain visible as zero, never fabricated.
    }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            value?: number;
            hadRecentInput?: boolean;
          };
          if (!shift.hadRecentInput) samples.cls += shift.value ?? 0;
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      // Layout-shift observer is not supported in every browser.
    }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (samples.longTasksMs.length < 2000) samples.longTasksMs.push(entry.duration);
        }
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // Unsupported long-task observer is reported by the runner profile.
    }

    let previous = 0;
    let sampling = true;
    window.__perfStopFrames = () => {
      sampling = false;
    };
    const sampleFrames = (now: number) => {
      if (!sampling) return;
      if (document.visibilityState === "visible" && previous > 0 && now - previous > 50) {
        if (samples.frameGapsMs.length < 2000) samples.frameGapsMs.push(now - previous);
      }
      previous = document.visibilityState === "visible" ? now : 0;
      requestAnimationFrame(sampleFrames);
    };
    requestAnimationFrame(sampleFrames);
  });
}

// Explicit opt-in only; the normal CI/main/release path never injects a stall.
const negativeControlMs = process.env.PERF_NEGATIVE_CONTROL_GUIDED_STALL_MS
  ? Number(process.env.PERF_NEGATIVE_CONTROL_GUIDED_STALL_MS)
  : 0;
if (
  negativeControlMs !== 0 &&
  (target !== "local" ||
    !Number.isInteger(negativeControlMs) ||
    negativeControlMs < 800 ||
    negativeControlMs > 2000)
) {
  throw new Error("Negative-control Guided stall requires local target and 800..2000ms");
}

async function paintAfterAction(
  page: Page,
  action: () => Promise<void>,
  injectedStallMs = 0,
): Promise<number> {
  const start = Date.now();
  await action();
  // Block the page main thread *after the Guided action* but *before the paint*
  // being timed. This must fail the measured interaction-proxy comparator.
  if (injectedStallMs > 0) {
    await page.evaluate((stallMs) => {
      const until = performance.now() + stallMs;
      while (performance.now() < until) {
        // Intentional, bounded, test-only negative control.
      }
    }, injectedStallMs);
  }
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  return Date.now() - start;
}

async function measureLandingSceneAction(
  page: Page,
  dot: Locator,
  sceneIndex: number,
): Promise<LandingSceneTiming> {
  // Preserve the original end-to-end driver-inclusive proxy and five actions.
  const start = Date.now();
  const clickStart = Date.now();
  await dot.click();
  const driverClickMs = Date.now() - clickStart;

  const expectationStart = Date.now();
  await expect(dot).toHaveAttribute("aria-current", "true");
  const domExpectationMs = Date.now() - expectationStart;

  const rafStart = Date.now();
  const browserDoubleRafMs = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        // In-page monotonic clock excludes the Playwright command round trip.
        // Two rAF callbacks are a scheduling proxy, NOT a field paint/INP metric.
        const requestedAt = performance.now();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve(performance.now() - requestedAt));
        });
      }),
  );
  const driverDoubleRafMs = Date.now() - rafStart;

  return {
    sceneIndex,
    driverClickMs,
    domExpectationMs,
    driverDoubleRafMs,
    browserDoubleRafMs,
    interactionToPaintProxyMs: Date.now() - start,
  };
}

async function measureRoute(page: Page, route: string, profileName: string): Promise<RouteSample> {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const start = Date.now();
  const response = await page.goto(new URL(route, baseURL).toString(), {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status(), route + " returned an unexpected HTTP status").toBe(200);
  // Do not sample an incomplete load or mistake a missing LCP for a fast page.
  await page.waitForFunction(() => (window.__perfSamples?.lcpMs ?? 0) > 0, undefined, {
    timeout: 15_000,
  });

  let interactionToPaintProxyMs: number | null = null;
  const landingSceneTimings: LandingSceneTiming[] = [];
  if (route === "/willkommen") {
    const sections = page.getByRole("navigation", { name: "Abschnitte" });
    await expect(page.getByRole("heading", { name: "Über KI reden" })).toBeVisible();
    await expect(sections.getByRole("button")).toHaveCount(5);
    await expect(page.locator(".lp-layer")).toHaveCount(4);
    const canvas = page.locator("canvas.lp-fx");
    await expect(canvas).toHaveCount(1);
    if (!profileName.includes("reduced")) {
      expect(
        await canvas.evaluate((element) => (element as HTMLCanvasElement).width),
      ).toBeGreaterThan(0);
    }

    for (let index = 1; index <= 5; index += 1) {
      const dot = sections.getByRole("button", { name: "Abschnitt " + index + " von 5" });
      const timing = await measureLandingSceneAction(page, dot, index);
      landingSceneTimings.push(timing);
      interactionToPaintProxyMs = Math.max(
        interactionToPaintProxyMs ?? 0,
        timing.interactionToPaintProxyMs,
      );
    }
    await expect(page.getByRole("link", { name: "Erste Übung starten" })).toHaveAttribute(
      "href",
      "/anmelden",
    );
  } else if (route === "/") {
    await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
    interactionToPaintProxyMs = await paintAfterAction(page, () =>
      page
        .getByRole("link", { name: /^Explore/ })
        .first()
        .focus(),
    );
  } else if (route === "/training/vscode-basics.guided") {
    await expect(
      page.locator('p[role="status"]').filter({ hasText: "Training bereit" }),
    ).toBeVisible();
    interactionToPaintProxyMs = await paintAfterAction(
      page,
      async () => {
        await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
        await expect(page.getByRole("heading", { name: /Schritt 7/ })).toBeVisible();
      },
      negativeControlMs,
    );
  }

  const readyMs = Date.now() - start;
  const samples = await page.evaluate(() => {
    window.__perfStopFrames?.();
    return window.__perfSamples;
  });
  if (!samples) throw new Error("Performance observer did not initialize for " + route);
  if (pageErrors.length > 0)
    throw new Error("Browser errors on " + route + ": " + pageErrors.join("; "));

  return {
    route,
    readyMs,
    lcpMs: samples.lcpMs,
    cls: samples.cls,
    longTaskCount: samples.longTasksMs.length,
    longTaskMaxMs: Math.max(0, ...samples.longTasksMs),
    frameGapMaxMs: Math.max(0, ...samples.frameGapsMs),
    interactionToPaintProxyMs,
    ...(route === "/willkommen" ? { landingSceneTimings } : {}),
  };
}

// Run only after every original cold route sample, in a fresh untraced context.
// Browser event times are relative to instrumentation arming; they are NOT INP,
// paint, or a synchronized Playwright-driver/browser-clock measurement.
async function replayLandingAction(
  page: Page,
  dot: Locator,
  kind: "already-active-first-dot" | "second-dot-transition",
): Promise<Extract<LandingActionabilityReplay, { status: "RECORDED" }>["actions"][number]> {
  const scene = page.locator(".lp");
  const initialScene = await scene.getAttribute("data-scene");
  await dot.evaluate((element) => {
    const state = {
      armedAt: performance.now(),
      pointerDownAt: null as number | null,
      clickAt: null as number | null,
      sceneChangeAt: null as number | null,
      stop: () => {},
    };
    const onPointerDown = () => {
      state.pointerDownAt ??= performance.now();
    };
    const onClick = () => {
      state.clickAt ??= performance.now();
    };
    element.addEventListener("pointerdown", onPointerDown, true);
    element.addEventListener("click", onClick, true);
    const root = document.querySelector(".lp");
    const observer = new MutationObserver(() => {
      state.sceneChangeAt ??= performance.now();
    });
    if (root) observer.observe(root, { attributes: true, attributeFilter: ["data-scene"] });
    state.stop = () => {
      observer.disconnect();
      element.removeEventListener("pointerdown", onPointerDown, true);
      element.removeEventListener("click", onClick, true);
    };
    window.__perfLandingReplay = state;
  });

  const start = Date.now();
  const clickStart = Date.now();
  await dot.click();
  const driverClickMs = Date.now() - clickStart;
  const expectationStart = Date.now();
  await expect(dot).toHaveAttribute("aria-current", "true");
  const domExpectationMs = Date.now() - expectationStart;
  const rafStart = Date.now();
  const browserDoubleRafMs = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const armed = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve(performance.now() - armed)),
        );
      }),
  );
  const driverDoubleRafMs = Date.now() - rafStart;
  const driverInclusiveProxyMs = Date.now() - start;
  const browserEvents = await page.evaluate(() => {
    const state = window.__perfLandingReplay;
    if (!state) throw new Error("Missing browser actionability markers");
    state.stop();
    delete window.__perfLandingReplay;
    return {
      browserPointerDownAfterArmMs:
        state.pointerDownAt === null ? null : state.pointerDownAt - state.armedAt,
      browserClickAfterArmMs: state.clickAt === null ? null : state.clickAt - state.armedAt,
      browserSceneChangeAfterArmMs:
        state.sceneChangeAt === null ? null : state.sceneChangeAt - state.armedAt,
    };
  });
  const finalScene = await scene.getAttribute("data-scene");
  if (
    (kind === "already-active-first-dot" && (initialScene !== "0" || finalScene !== "0")) ||
    (kind === "second-dot-transition" && (initialScene !== "0" || finalScene !== "1"))
  ) {
    throw new Error(
      "No-op versus scene-transition replay did not observe the expected scene states",
    );
  }
  return {
    kind,
    initialScene,
    finalScene,
    driverClickMs,
    domExpectationMs,
    driverDoubleRafMs,
    browserDoubleRafMs,
    ...browserEvents,
    driverInclusiveProxyMs,
  };
}

async function replayLandingActionability(page: Page): Promise<LandingActionabilityReplay> {
  const response = await page.goto(new URL("/willkommen", baseURL).toString(), {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await page.waitForFunction(() => (window.__perfSamples?.lcpMs ?? 0) > 0, undefined, {
    timeout: 15_000,
  });
  const sections = page.getByRole("navigation", { name: "Abschnitte" });
  await expect(sections.getByRole("button")).toHaveCount(5);
  const first = sections.getByRole("button", { name: "Abschnitt 1 von 5" });
  const second = sections.getByRole("button", { name: "Abschnitt 2 von 5" });
  await expect(first).toHaveAttribute("aria-current", "true");
  const noOp = await replayLandingAction(page, first, "already-active-first-dot");
  const transition = await replayLandingAction(page, second, "second-dot-transition");
  return { status: "RECORDED", actions: [noOp, transition] };
}

// Independent untraced replay, after all cold samples. Never changes baseline observers.
async function replayDashboardAttribution(page: Page): Promise<DashboardAttributionReplay> {
  await page.addInitScript(() => {
    const frameGaps: DashboardInterval[] = [];
    const longTasks: DashboardInterval[] = [];
    let previousFrame: number | null = null;
    let sampling = true;
    let longTaskObserver: PerformanceObserver | null = null;
    let longTaskSupported = false;
    const collectLongTasks = (entries: PerformanceEntry[]) => {
      for (const entry of entries) {
        if (longTasks.length >= 2000) break;
        longTasks.push({
          startMs: entry.startTime,
          endMs: entry.startTime + entry.duration,
          durationMs: entry.duration,
        });
      }
    };
    try {
      longTaskObserver = new PerformanceObserver((list) => collectLongTasks(list.getEntries()));
      longTaskObserver.observe({ type: "longtask", buffered: true });
      longTaskSupported = true;
    } catch {
      // Unsupported observers are explicit NOT_RECORDED, never zero-duration evidence.
    }
    const sampleFrame = (now: number) => {
      if (!sampling) return;
      if (document.visibilityState === "visible") {
        if (previousFrame !== null && now - previousFrame > 50 && frameGaps.length < 2000) {
          frameGaps.push({
            startMs: previousFrame,
            endMs: now,
            durationMs: now - previousFrame,
          });
        }
        previousFrame = now;
      } else {
        previousFrame = null;
      }
      requestAnimationFrame(sampleFrame);
    };
    requestAnimationFrame(sampleFrame);
    window.__perfDashboardAttribution = {
      stop: () => {
        sampling = false;
        if (longTaskObserver) {
          collectLongTasks(longTaskObserver.takeRecords());
          longTaskObserver.disconnect();
        }
        return { frameGaps, longTasks, longTaskSupported };
      },
    };
  });
  const response = await page.goto(new URL("/", baseURL).toString(), {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await page.waitForFunction(() => (window.__perfSamples?.lcpMs ?? 0) > 0, undefined, {
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  const snapshot = await page.evaluate(() => window.__perfDashboardAttribution?.stop());
  if (!snapshot?.longTaskSupported) {
    return { status: "NOT_RECORDED", reason: "Dashboard long-task observer unsupported or missing" };
  }
  const longestFrameGap = snapshot.frameGaps.reduce<DashboardInterval | null>(
    (longest, item) => (!longest || item.durationMs > longest.durationMs ? item : longest),
    null,
  );
  const longestLongTask = snapshot.longTasks.reduce<DashboardInterval | null>(
    (longest, item) => (!longest || item.durationMs > longest.durationMs ? item : longest),
    null,
  );
  const overlappingIntervals = snapshot.frameGaps.flatMap((frameGap) =>
    snapshot.longTasks.flatMap((longTask) => {
      const overlapMs = Math.max(
        0,
        Math.min(frameGap.endMs, longTask.endMs) - Math.max(frameGap.startMs, longTask.startMs),
      );
      return overlapMs > 0 ? [{ frameGap, longTask, overlapMs }] : [];
    }),
  );
  const longestPairOverlapMs =
    longestFrameGap && longestLongTask
      ? Math.max(
          0,
          Math.min(longestFrameGap.endMs, longestLongTask.endMs) -
            Math.max(longestFrameGap.startMs, longestLongTask.startMs),
        )
      : 0;
  return {
    status: "RECORDED",
    frameGaps: snapshot.frameGaps,
    longTasks: snapshot.longTasks,
    longestFrameGap,
    longestLongTask,
    overlappingIntervals,
    longestPairOverlapMs,
    interpretation:
      "Same-navigation browser-clock intervals; overlap is temporal correlation, not proof of source, product cause, field INP, or Playwright driver actionability",
  };
}

async function configuredPage(browser: Browser, profile: (typeof profiles)[number]) {
  // Every cold sample and diagnostic replay gets an isolated browser context.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    reducedMotion: profile.reduced ? "reduce" : "no-preference",
  });
  try {
    const page = await context.newPage();
    await instrument(page);
    const session = await context.newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
    if (profile.constrainedNetwork) {
      await session.send("Network.enable");
      await session.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 80,
        downloadThroughput: 200_000,
        uploadThroughput: 100_000,
      });
    }
    return { context, page };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function runProfile(
  browser: Browser,
  profile: (typeof profiles)[number],
  outputPath: (name: string) => string,
) {
  if (browser.browserType().name() !== "chromium") {
    throw new Error("Performance measurements require Chromium CDP");
  }
  const rows: Array<{ run: number; routes: RouteSample[] }> = [];
  const routeNames =
    target === "release" ? ["/willkommen"] : ["/willkommen", "/", "/training/vscode-basics.guided"];
  for (let run = 1; run <= 3; run += 1) {
    const routes: RouteSample[] = [];
    for (const route of routeNames) {
      const { context, page } = await configuredPage(browser, profile);
      try {
        // Keep trace/screenshot/DOM snapshot instrumentation OUTSIDE the measured
        // window: it changes frame gaps, long tasks and constrained-device LCP.
        routes.push(await measureRoute(page, route, profile.name));
      } finally {
        await context.close();
      }
    }
    rows.push({ run, routes });
  }

  // Separate SHA-bound diagnostic replay, NOT included in the three cold samples.
  // One animated/reduced landing trace per profile preserves inspectable visuals
  // without letting trace overhead contaminate any reported baseline metrics.
  const { context, page } = await configuredPage(browser, profile);
  try {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    try {
      await measureRoute(page, "/willkommen", profile.name);
      await page.screenshot({ path: outputPath(profile.name + "-landing.png") });
    } finally {
      await context.tracing.stop({
        path: outputPath(profile.name + "-landing-diagnostic-trace.zip"),
      });
    }
  } finally {
    await context.close();
  }
  // This replay is non-gating and has its own browser context. Failures are
  // recorded, never hidden or substituted for the original baseline samples.
  let landingActionabilityReplay: LandingActionabilityReplay;
  try {
    const replay = await configuredPage(browser, profile);
    try {
      landingActionabilityReplay = await replayLandingActionability(replay.page);
    } finally {
      await replay.context.close();
    }
  } catch (error) {
    landingActionabilityReplay = {
      status: "NOT_RECORDED",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  // Separate post-cold dashboard diagnostic: never used by baseline or gates.
  let dashboardAttributionReplay: DashboardAttributionReplay;
  try {
    const replay = await configuredPage(browser, profile);
    try {
      dashboardAttributionReplay = await replayDashboardAttribution(replay.page);
    } finally {
      await replay.context.close();
    }
  } catch (error) {
    dashboardAttributionReplay = {
      status: "NOT_RECORDED",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  return { rows, landingActionabilityReplay, dashboardAttributionReplay };
}

for (const profile of profiles) {
  test(profile.name + ": three cold production-artifact samples", async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    const { rows, landingActionabilityReplay, dashboardAttributionReplay } = await runProfile(browser, profile, (name) =>
      testInfo.outputPath(name),
    );
    await writeFile(
      testInfo.outputPath(profile.name + "-samples.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          artifactSha,
          target,
          profile,
          browser: browser.browserType().name(),
          viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
          runs: rows,
          landingActionabilityReplay,
          dashboardAttributionReplay,
          syntheticOnly: true,
          fieldEvidence: false,
          metricNotes:
            "interactionToPaintProxyMs includes Playwright driver time; landingSceneTimings, landingActionabilityReplay and dashboardAttributionReplay are non-gating diagnostics; dashboard intervals use one browser clock and temporal overlap does not establish cause or field INP",
        },
        null,
        2,
      ),
    );
  });
}
