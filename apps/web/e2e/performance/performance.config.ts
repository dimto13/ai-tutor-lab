import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

// Resolve against this config file, not the process working directory.
// The permanent workflow and report.mjs consume these exact paths.
const outputDir = fileURLToPath(new URL("../test-results-performance/", import.meta.url));
const htmlReportDir = fileURLToPath(new URL("../playwright-report-performance/", import.meta.url));

const baseURL = process.env.PERF_BASE_URL;
if (!baseURL) throw new Error("PERF_BASE_URL is required");

export default defineConfig({
  testDir: ".",
  testMatch: "performance.spec.ts",
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [["line"], ["html", { outputFolder: htmlReportDir, open: "never" }]],
  outputDir,
  use: { baseURL, trace: "off", screenshot: "only-on-failure", video: "off" },
  projects: [{ name: "performance-chromium", use: { ...devices["Desktop Chrome"] } }],
});
