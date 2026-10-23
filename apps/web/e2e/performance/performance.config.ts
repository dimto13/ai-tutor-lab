import { defineConfig, devices } from "@playwright/test";

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
  reporter: [["line"], ["html", { outputFolder: "playwright-report-performance", open: "never" }]],
  outputDir: "test-results-performance",
  use: { baseURL, trace: "off", screenshot: "only-on-failure", video: "off" },
  projects: [{ name: "performance-chromium", use: { ...devices["Desktop Chrome"] } }],
});
