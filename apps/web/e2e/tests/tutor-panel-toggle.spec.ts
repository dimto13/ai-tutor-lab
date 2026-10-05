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

async function expectVisibleBottomGap(page: Page, testId: string): Promise<void> {
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

for (const width of [1280, 1440]) {
  test(`Challenge tutor header keeps labels intact at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/training/vscode-basics.challenge");
    await ready(page);
    const panel = page.getByTestId("tutor-chat-expanded");
    await expect(panel).toBeVisible();

    for (const label of ["KI-Tutor", "nur auf Anfrage", "Ich habe ein Problem"]) {
      const lines = await panel.evaluate((root, text) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const start = node.textContent?.indexOf(text) ?? -1;
          if (start < 0) continue;
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + text.length);
          return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
        }
        throw new Error(`Missing tutor header label: ${text}`);
      }, label);
      expect(lines, `${label} must occupy one intact text line`).toBe(1);
    }

    const problem = panel.getByRole("button", { name: "Ich habe ein Problem", exact: true });
    await problem.focus();
    await problem.press("Enter");
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Problem melden" }),
    ).toBeVisible();
  });
}
