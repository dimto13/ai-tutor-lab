import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await expect(page.getByTestId("training-mode")).toBeVisible();
}

async function openGuidedTutor(page: Page) {
  await page.goto("/training/vscode-basics.guided");
  await ready(page);
  await page.getByTestId("tutor-chat-toggle").click();
  await expect(page.getByTestId("tutor-chat-expanded")).toBeVisible();
}

async function expectVisibleBottomGap(page: Page, testId: string) {
  const surface = page.getByTestId(testId);
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error(`${testId} has no bounding box`);

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!viewport) throw new Error("viewport size is unavailable");

  const bottomGap = viewport.height - (box.y + box.height);
  expect(bottomGap).toBeGreaterThanOrEqual(8);
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

test("Tutor surfaces keep a visible bottom gap", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.goto("/training/vscode-basics.explore");
  await ready(page);

  await expectVisibleBottomGap(page, "tutor-chat-expanded");

  await page.getByTestId("tutor-chat-close").click();
  await expectVisibleBottomGap(page, "tutor-chat-collapsed");
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
