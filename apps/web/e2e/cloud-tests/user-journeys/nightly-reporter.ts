import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

type JourneyStatus = "PASS" | "FAIL" | "BLOCKED" | "NOT_TESTED";
interface JourneyResult {
  journeyId: string;
  status: JourneyStatus;
  durationMs: number;
  failedStep?: string;
}

const JOURNEY_IDS = Array.from({ length: 10 }, (_, index) => `CLOUD-${index + 1}`);
const KNOWN_BLOCKED = new Set(["CLOUD-5", "CLOUD-8"]);

export default class NightlyJourneyReporter implements Reporter {
  private readonly results = new Map<string, JourneyResult>();

  onTestEnd(test: TestCase, result: TestResult): void {
    const match = /^\[CLOUD-(?:10|[1-9])\]/.exec(test.title);
    if (!match) return;
    const journeyId = match[0].slice(1, -1);
    const status: JourneyStatus =
      result.status === "passed"
        ? "PASS"
        : result.status === "skipped"
          ? "NOT_TESTED"
          : result.errors.some((error) => error.message?.startsWith("CLOUD_BLOCKED:"))
            ? "BLOCKED"
            : "FAIL";
    this.results.set(journeyId, {
      journeyId,
      status,
      durationMs: result.duration,
      ...(status === "FAIL" ? { failedStep: test.title } : {}),
    });
  }

  async onEnd(fullResult: FullResult): Promise<{ status: FullResult["status"] }> {
    const results = JOURNEY_IDS.map(
      (journeyId) =>
        this.results.get(journeyId) ?? {
          journeyId,
          status: KNOWN_BLOCKED.has(journeyId) ? ("BLOCKED" as const) : ("NOT_TESTED" as const),
          durationMs: 0,
        },
    );
    const passed = results.filter((result) => result.status === "PASS").length;
    // An unimplemented or blocked journey is not an accepted release. Exit nonzero until all ten
    // have executed and passed; never turn missing cloud evidence into a green nightly.
    const failed = results.length - passed;
    const file = resolve(
      process.env.NIGHTLY_REPORT_DIR ?? "/tmp/ai-train-lab-nightly",
      "journeys.json",
    );
    await mkdir(dirname(file), { recursive: true });
    await writeFile(
      file,
      JSON.stringify(
        {
          suite: "cloud-user-journeys",
          environment: process.env.CLOUD_ENVIRONMENT?.trim() || "cloud",
          releaseSha: process.env.CLOUD_RELEASE_SHA?.trim() || null,
          browser: "chromium",
          results,
          summary: { passed, failed },
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    const status = failed > 0 || fullResult.status !== "passed" ? "failed" : "passed";
    // Preserve a nonzero CLI exit even when other Playwright reporters are installed.
    if (status === "failed") process.exitCode = 1;
    return { status };
  }
}
