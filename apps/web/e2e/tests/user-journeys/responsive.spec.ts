import { expect, test, type Locator, type Page } from "../../fixtures/browser-error-guard";
import { VSCODE_GUIDED_URL, documentJourney, waitForTrainingReady } from "./journey-support";

const viewports = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "mobile-portrait", width: 390, height: 844 },
  { name: "mobile-landscape", width: 844, height: 390 },
] as const;

async function expectWithinViewport(page: Page, locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const [box, viewport] = await Promise.all([
    locator.boundingBox(),
    Promise.resolve(page.viewportSize()),
  ]);
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) return;

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

test("[UJ-RESPONSIVE] tutor and navigation work at desktop, portrait and landscape", async ({
  page,
}, testInfo) => {
  documentJourney(testInfo, {
    id: "UJ-RESPONSIVE",
    initialState: "Fresh Guided route is opened separately at each required viewport.",
    successCondition:
      "Dashboard navigation, mobile workspace switching and Tutor open/close controls remain visible and operable without horizontal overflow.",
  });

  for (const viewport of viewports) {
    await test.step(viewport.name, async () => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(VSCODE_GUIDED_URL);
      await waitForTrainingReady(page);

      await expectWithinViewport(
        page,
        page.getByRole("link", { name: "AI Training Lab – zurück zum Dashboard" }),
      );
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);

      if (viewport.name !== "desktop") {
        const showGuide = page.getByRole("button", { name: "Guide anzeigen" });
        await expectWithinViewport(page, showGuide);
        await showGuide.click();

        const showWorkspace = page.getByRole("button", { name: "Arbeitsbereich anzeigen" });
        await expectWithinViewport(page, showWorkspace);
        await expect(page.getByTestId("guided-orientation")).toBeVisible();
        await showWorkspace.click();
        await expect(page.getByRole("button", { name: "Explorer", exact: true })).toBeVisible();

        // On small screens the Tutor belongs to the guide pane, not the workspace pane.
        await expectWithinViewport(page, showGuide);
        await showGuide.click();
        await expect(page.getByTestId("guided-orientation")).toBeVisible();
      }

      const tutorToggle = page.getByTestId("tutor-chat-toggle");
      await expectWithinViewport(page, tutorToggle);
      await tutorToggle.click();
      await expect(page.getByTestId("tutor-chat-expanded")).toBeVisible();

      const tutorClose = page.getByTestId("tutor-chat-close");
      await expectWithinViewport(page, tutorClose);
      await tutorClose.click();
      await expect(tutorToggle).toBeFocused();
      await expect(page.getByTestId("tutor-chat-collapsed")).toBeVisible();
    });
  }
});
