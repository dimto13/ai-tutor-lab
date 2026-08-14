import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.CLOUD_BASE_URL?.trim();
if (!baseURL) {
  throw new Error("CLOUD_BASE_URL is required for cloud acceptance tests.");
}

export default defineConfig({
  testDir: "./cloud-tests",
  outputDir: "./cloud-test-results",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL,
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
