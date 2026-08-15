import { expect, test, type Locator, type Page } from "@playwright/test";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

async function expectSpotlightContains(spotlight: Locator, target: Locator): Promise<void> {
  await expect(spotlight).toBeVisible();
  await expect
    .poll(async () => {
      const [spotlightBox, targetBox] = await Promise.all([
        spotlight.boundingBox(),
        target.boundingBox(),
      ]);
      if (!spotlightBox || !targetBox) return false;
      return (
        spotlightBox.x <= targetBox.x &&
        spotlightBox.y <= targetBox.y &&
        spotlightBox.x + spotlightBox.width >= targetBox.x + targetBox.width &&
        spotlightBox.y + spotlightBox.height >= targetBox.y + targetBox.height
      );
    })
    .toBe(true);
}

async function expectSpotlightAround(spotlight: Locator, target: Locator): Promise<void> {
  await expect(spotlight).toBeVisible();
  await expect
    .poll(async () => {
      const [spotlightBox, targetBox, viewport] = await Promise.all([
        spotlight.boundingBox(),
        target.boundingBox(),
        target.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
      ]);
      if (!spotlightBox || !targetBox) return null;

      const padding = 6;
      const viewportInset = 2;
      const expectedLeft = Math.max(viewportInset, targetBox.x - padding);
      const expectedTop = Math.max(viewportInset, targetBox.y - padding);
      const expectedRight = Math.min(
        viewport.width - viewportInset,
        targetBox.x + targetBox.width + padding,
      );
      const expectedBottom = Math.min(
        viewport.height - viewportInset,
        targetBox.y + targetBox.height + padding,
      );

      return {
        top: Math.round(spotlightBox.y - expectedTop),
        right: Math.round(spotlightBox.x + spotlightBox.width - expectedRight),
        bottom: Math.round(spotlightBox.y + spotlightBox.height - expectedBottom),
        left: Math.round(spotlightBox.x - expectedLeft),
      };
    })
    .toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
}

test("Guided: Grundbegriffe zeigen sofort und interaktiv ihre VS-Code-Bereiche", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/training/vscode-basics.guided");
  await waitForTrainingReady(page);
  await expectGuidedStep(page, 1, "Activity Bar einordnen");

  const spotlight = page.getByTestId("highlight-frame");
  await expect(spotlight).toHaveAttribute("data-highlight-concept", "vscode.activity_bar");
  await expectSpotlightContains(
    spotlight,
    page.getByRole("button", { name: "Explorer", exact: true }),
  );
  await expectSpotlightContains(
    spotlight,
    page.getByRole("button", { name: "Extensions", exact: true }),
  );

  const sideBarConcept = page
    .getByRole("button", { name: "Side Bar: Begriffserklärung öffnen und in der Oberfläche zeigen" })
    .first();
  await sideBarConcept.click();
  await expect(spotlight).toHaveAttribute("data-highlight-concept", "vscode.side_bar");
  await expectSpotlightAround(spotlight, page.locator('[data-highlight="vscode.sideBar"]'));

  await expectGuidedStep(page, 1, "Activity Bar einordnen");
  await expect(page.getByText("Noch keine Aktion geprüft.", { exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(spotlight).toHaveAttribute("data-highlight-concept", "vscode.activity_bar");

  await page.getByRole("button", { name: "Grundbegriff verstanden" }).click();
  await expectGuidedStep(page, 2, "Side Bar einordnen");
  await expect(spotlight).toHaveAttribute("data-highlight-concept", "vscode.side_bar");
  await expectSpotlightAround(spotlight, page.locator('[data-highlight="vscode.sideBar"]'));
});
