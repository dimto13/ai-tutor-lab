import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";
import cloudConfig from "./cloud.playwright.config";

const releaseSha = process.env.CLOUD_RELEASE_SHA?.trim();
if (!releaseSha || !/^[a-f0-9]{40}$/i.test(releaseSha)) {
  throw new Error("CLOUD_RELEASE_SHA must be the exact 40-character deploy commit.");
}

const reportDir = resolve(process.env.NIGHTLY_REPORT_DIR ?? "nightly-artifacts");

export default defineConfig(cloudConfig, {
  reporter: [
    ["line"],
    ["junit", { outputFile: resolve(reportDir, "junit.xml") }],
    ["html", { outputFolder: resolve(reportDir, "html"), open: "never" }],
    ["./cloud-tests/user-journeys/nightly-reporter.ts"],
  ],
});
