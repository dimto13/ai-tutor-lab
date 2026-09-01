import { expect, test, type Page } from "../fixtures/browser-error-guard";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status").filter({ hasText: "Training bereit" })).toContainText(
    "Training bereit",
  );
}

async function openGuidedScenario(page: Page, scenarioId: string): Promise<void> {
  await page.goto(`/training/${scenarioId}`);
  await waitForTrainingReady(page);
}

async function expectAttentionAvailable(page: Page): Promise<void> {
  const button = page.getByTestId("show-current-target");
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("highlight-frame")).toBeVisible();
  await expect(page.getByTestId("highlight-announcement")).toContainText(/Lernziel|Hervorgehobenes Ziel/i);
}

test.describe("Tutor attention", () => {
  test.describe.configure({ retries: 0 });

  test("Ziel zeigen resolves the current VS Code UiTargetRef, retriggers, and times out", async ({
    page,
  }) => {
    await openGuidedScenario(page, "vscode-basics.guided");
    await expectAttentionAvailable(page);

    const button = page.getByTestId("show-current-target");
    await page.waitForTimeout(1_500);
    await button.click();
    await page.waitForTimeout(1_200);
    await expect(page.getByTestId("highlight-frame")).toBeVisible();
    await expect(page.getByTestId("highlight-frame")).toHaveCount(0, { timeout: 3_000 });
  });

  test("Ziel zeigen uses the same generic attention path for the M365 runtime adapter", async ({
    page,
  }) => {
    await openGuidedScenario(page, "m365-copilot-basics.guided");
    await expectAttentionAvailable(page);
    await expect(page.getByTestId("highlight-tooltip")).toContainText("aktuellen Lernziel");
  });

  test("reduced motion keeps a visible target frame without pulse animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openGuidedScenario(page, "m365-copilot-basics.guided");

    await page.getByTestId("show-current-target").click();
    const frame = page.getByTestId("highlight-frame");
    await expect(frame).toBeVisible();
    await expect
      .poll(() => frame.evaluate((element) => getComputedStyle(element).animationName))
      .toBe("none");
    await expect
      .poll(() => frame.evaluate((element) => getComputedStyle(element).boxShadow !== "none"))
      .toBe(true);
  });
});
