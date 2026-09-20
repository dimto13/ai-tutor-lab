import { expect, test, type Page } from "../fixtures/browser-error-guard";

async function ready(page: Page): Promise<void> {
  await expect(page.locator('p[role="status"]').filter({ hasText: "Training bereit" })).toHaveText(
    "Training bereit",
  );
}

async function openGuidedTutor(page: Page): Promise<void> {
  await page.goto("/training/vscode-basics.guided");
  await ready(page);
  const toggle = page.getByTestId("tutor-chat-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(page.getByTestId("tutor-chat-expanded")).toBeVisible();
}

test("Tutor panel closes, restores focus and preserves its conversation", async ({ page }) => {
  await openGuidedTutor(page);

  const history = page.getByRole("region", { name: "Tutor-Verlauf" });
  const initialMessage =
    "Ich kenne dein aktuelles Modul und den Trainingskontext. Du kannst jederzeit eine konkrete Frage stellen.";
  await expect(history).toContainText(initialMessage);

  const activeStep = page.locator('[aria-current="step"]');
  const activeStepTestId = await activeStep.getAttribute("data-testid");
  expect(activeStepTestId).not.toBeNull();

  const close = page.getByTestId("tutor-chat-close");
  await close.focus();
  await close.press("Enter");

  const toggle = page.getByTestId("tutor-chat-toggle");
  await expect(page.getByTestId("tutor-chat-collapsed")).toBeVisible();
  await expect(toggle).toBeFocused();
  expect(await page.locator('[aria-current="step"]').getAttribute("data-testid")).toBe(
    activeStepTestId,
  );
  await toggle.press("Enter");

  await expect(page.getByTestId("tutor-chat-expanded")).toBeVisible();
  await expect(page.getByPlaceholder("Frage an den Tutor…")).not.toBeFocused();
  await expect(history).toContainText(initialMessage);
  expect(await page.locator('[aria-current="step"]').getAttribute("data-testid")).toBe(
    activeStepTestId,
  );
});

test("Tutor panel can be dismissed in explore and challenge modes", async ({ page }) => {
  for (const mode of ["explore", "challenge"] as const) {
    await page.goto(`/training/vscode-basics.${mode}`);
    await ready(page);
    await expect(page.getByTestId("tutor-chat-expanded")).toBeVisible();
    await page.getByTestId("tutor-chat-close").click();
    await expect(page.getByTestId("tutor-chat-collapsed")).toBeVisible();
    await page.getByTestId("tutor-chat-toggle").click();
    await expect(page.getByTestId("tutor-chat-expanded")).toBeVisible();
  }
});

test("Collapsed tutor releases training space on a short responsive viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto("/training/vscode-basics.explore");
  await ready(page);

  const close = page.getByTestId("tutor-chat-close");
  await expect(close).toBeVisible();
  await close.click();
  const collapsed = page.getByTestId("tutor-chat-collapsed");
  await expect(collapsed).toBeVisible();
  const box = await collapsed.boundingBox();
  expect(box?.height ?? 640).toBeLessThan(140);
});
