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

  const history = page.getByRole("region", { name: /Tutor/ });
  const initialMessage =
    "Ich kenne dein aktuelles Modul und den Trainingskontext. Du kannst jederzeit eine konkrete Frage stellen.";
  await expect(history).toContainText(initialMessage);

  await page.getByRole("button", { name: "Was ist ein Workspace?" }).click();
  await expect(history).toContainText("Was ist ein Workspace?");

  const stepBefore = await page
    .locator('[data-testid="guided-current-step"]')
    .textContent()
    .catch(() => null);
  const close = page.getByTestId("tutor-chat-close");
  await close.focus();
  await close.press("Enter");

  const toggle = page.getByTestId("tutor-chat-toggle");
  await expect(page.getByTestId("tutor-chat-collapsed")).toBeVisible();
  await expect(toggle).toBeFocused();
  await toggle.press("Enter");

  await expect(page.getByTestId("tutor-chat-expanded")).toBeVisible();
  await expect(page.getByPlaceholder("Frage an den Tutor…")).not.toBeFocused();
  await expect(history).toContainText(initialMessage);
  await expect(history).toContainText("Was ist ein Workspace?");

  if (stepBefore !== null) {
    await expect(page.locator('[data-testid="guided-current-step"]')).toHaveText(stepBefore);
  }
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

test("Collapsed tutor releases training space on a small viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto("/training/vscode-basics.explore");
  await ready(page);

  await page.getByTestId("tutor-chat-close").click();
  const collapsed = page.getByTestId("tutor-chat-collapsed");
  await expect(collapsed).toBeVisible();
  const box = await collapsed.boundingBox();
  expect(box?.height ?? 640).toBeLessThan(140);
});
