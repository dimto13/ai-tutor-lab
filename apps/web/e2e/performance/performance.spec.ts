import { writeFile } from "node:fs/promises";

import { expect, test, type Browser, type Page } from "@playwright/test";

type PerfSamples = {
  lcpMs: number;
  cls: number;
  longTasksMs: number[];
  frameGapsMs: number[];
};

declare global {
  interface Window {
    __perfSamples?: PerfSamples;
  }
}

type RouteSample = {
  route: string;
  readyMs: number;
  lcpMs: number;
  cls: number;
  longTaskCount: number;
  longTaskMaxMs: number;
  frameGapMaxMs: number;
  interactionToPaintProxyMs: number | null;
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
    const sampleFrames = (now: number) => {
      if (document.visibilityState === "visible" && previous > 0 && now - previous > 50) {
        if (samples.frameGapsMs.length < 2000) samples.frameGapsMs.push(now - previous);
      }
      previous = now;
      requestAnimationFrame(sampleFrames);
    };
    requestAnimationFrame(sampleFrames);
  });
}

async function paintAfterAction(page: Page, action: () => Promise<void>): Promise<number> {
  const start = Date.now();
  await action();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  return Date.now() - start;
}

async function measureRoute(
  page: Page,
  route: string,
  profileName: string,
  firstRun: boolean,
  outputPath: (name: string) => string,
): Promise<RouteSample> {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await instrument(page);

  const start = Date.now();
  const response = await page.goto(new URL(route, baseURL).toString(), {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status(), route + " returned an unexpected HTTP status").toBe(200);

  let interactionToPaintProxyMs: number | null = null;
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
      const latency = await paintAfterAction(page, async () => {
        await dot.click();
        await expect(dot).toHaveAttribute("aria-current", "true");
      });
      interactionToPaintProxyMs = Math.max(interactionToPaintProxyMs ?? 0, latency);
    }
    await expect(page.getByRole("link", { name: "Erste Übung starten" })).toHaveAttribute(
      "href",
      "/anmelden",
    );
    if (firstRun) await page.screenshot({ path: outputPath(profileName + "-landing.png") });
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
    interactionToPaintProxyMs = await paintAfterAction(page, async () => {
      await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
      await expect(page.getByRole("heading", { name: /Schritt 7/ })).toBeVisible();
    });
  }

  const readyMs = Date.now() - start;
  await page.waitForTimeout(350);
  const samples = await page.evaluate(() => window.__perfSamples);
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
  };
}

async function runProfile(
  browser: Browser,
  profile: (typeof profiles)[number],
  outputPath: (name: string) => string,
) {
  const rows: Array<{ run: number; routes: RouteSample[] }> = [];
  for (let run = 1; run <= 3; run += 1) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      reducedMotion: profile.reduced ? "reduce" : "no-preference",
    });
    const page = await context.newPage();
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
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const routes: RouteSample[] = [];
    try {
      for (const route of target === "release"
        ? ["/willkommen"]
        : ["/willkommen", "/", "/training/vscode-basics.guided"]) {
        routes.push(await measureRoute(page, route, profile.name, run === 1, outputPath));
      }
      rows.push({ run, routes });
    } finally {
      await context.tracing.stop({
        path: outputPath(profile.name + "-run-" + run + "-trace.zip"),
      });
      await context.close();
    }
  }
  return rows;
}

for (const profile of profiles) {
  test(profile.name + ": three cold production-artifact samples", async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    const rows = await runProfile(browser, profile, (name) => testInfo.outputPath(name));
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
          syntheticOnly: true,
          fieldEvidence: false,
          metricNotes: "interactionToPaintProxyMs includes Playwright driver time; it is not INP",
        },
        null,
        2,
      ),
    );
  });
}
