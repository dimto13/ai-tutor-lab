import { expect, test, type Locator, type Page } from "../fixtures/browser-error-guard";
import { expectGuidedActionTargetUnobstructed } from "../helpers/guided-overlay-obstruction";

// #454: In vscode-basics.guided step 10 the instruction asks the learner to check
// the unsaved-changes dot in the editor tab. The spotlight tooltip must keep that
// tab, the Guided instruction surface and the guide column clear on every
// supported viewport, and fall back to a collapsed, recallable hint when no
// collision-free position exists.

const DESKTOP_VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1300, height: 620 },
  { width: 1024, height: 768 },
] as const;

// Browser zoom shrinks the CSS viewport: 200 % on 1280×720 lays out like 640×360.
const SMALL_VIEWPORTS = [
  { label: "200 % Zoom auf 1280×720", width: 640, height: 360 },
  { label: "Smartphone hochkant", width: 390, height: 844 },
] as const;

const HINT_BUTTON_NAME = "Hinweis zum hervorgehobenen Ziel";

function isMobileLayout(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < 1024;
}

async function expectStep(page: Page, number: number, title: string): Promise<void> {
  const name = `Schritt ${number} – ${title}`;
  // Below lg the guide column is a separate surface and hidden while the workspace is shown.
  if (isMobileLayout(page)) {
    await expect(page.getByRole("heading", { name, includeHidden: true })).toBeAttached();
    return;
  }
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function reachUnsavedEditorStep(page: Page): Promise<Locator> {
  await page.goto("/training/vscode-basics.guided");
  await expect(page.getByRole("status")).toHaveText("Training bereit");
  if (isMobileLayout(page)) await page.getByRole("button", { name: "Guide anzeigen" }).click();
  await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
  if (isMobileLayout(page)) {
    await page.getByRole("button", { name: "Arbeitsbereich anzeigen" }).click();
  }
  await expectStep(page, 7, "Explorer öffnen");

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expectStep(page, 8, "Einen Ordner als Arbeitskontext öffnen");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page
    .getByRole("menu", { name: "File menu" })
    .getByRole("menuitem", { name: /Open Folder\.\.\./ })
    .click();
  await expectStep(page, 9, "Datei erstellen");

  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  const filename = page.getByPlaceholder("dateiname.ext");
  await filename.fill("notiz.txt");
  await filename.press("Enter");
  await expectStep(page, 10, "Datei bearbeiten und speichern");

  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.fill("Hello AI Training");
  return editor;
}

function dirtyIndicator(page: Page): Locator {
  return page.getByRole("status", { name: "notiz.txt: ungespeicherte Änderungen" });
}

async function expectStepSurfacesClear(page: Page, editor: Locator): Promise<void> {
  await expect(dirtyIndicator(page)).toBeVisible();
  await expectGuidedActionTargetUnobstructed(
    page,
    { name: "Editor-Inhalt", locator: editor },
    {
      informationSurfaces: [
        { name: "Tab-Leiste", locator: page.locator('[data-highlight="vscode.editor.tabs"]') },
        { name: "Dirty-Indikator im Tab", locator: dirtyIndicator(page) },
      ],
    },
  );
}

async function expectBoxesDisjoint(left: Locator, right: Locator, message: string): Promise<void> {
  const [leftBox, rightBox] = await Promise.all([left.boundingBox(), right.boundingBox()]);
  if (!leftBox || !rightBox) throw new Error(`${message}: Boundingbox fehlt.`);
  const width =
    Math.min(leftBox.x + leftBox.width, rightBox.x + rightBox.width) -
    Math.max(leftBox.x, rightBox.x);
  const height =
    Math.min(leftBox.y + leftBox.height, rightBox.y + rightBox.height) -
    Math.max(leftBox.y, rightBox.y);
  expect(Math.max(0, width) * Math.max(0, height), message).toBe(0);
}

async function expectInsideViewport(page: Page, locator: Locator, message: string): Promise<void> {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error(`${message}: Boundingbox oder Viewport fehlt.`);
  expect(box.x, message).toBeGreaterThanOrEqual(0);
  expect(box.y, message).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, message).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height, message).toBeLessThanOrEqual(viewport.height);
}

for (const viewport of DESKTOP_VIEWPORTS) {
  test(`Guided #454: Spotlight-Hinweis lässt Dirty-Tab und Instruktion frei bei ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const editor = await reachUnsavedEditorStep(page);

    await expectStepSurfacesClear(page, editor);

    // The hint stays available: either placed collision-free or collapsed. Never both.
    const tooltip = page.getByTestId("highlight-tooltip");
    const hint = page.getByTestId("highlight-hint");
    await expect(tooltip.or(hint)).toBeVisible();
    const platformChrome = (await tooltip.isVisible()) ? tooltip : hint;
    await expectBoxesDisjoint(
      platformChrome,
      page.locator('[data-platform-ui="guide"]'),
      "Spotlight-Hinweis darf die Guide-Spalte nicht überdecken",
    );

    await editor.press("Control+s");
    await expectStep(page, 11, "Bereich und Ansichten unterscheiden");
  });
}

for (const viewport of SMALL_VIEWPORTS) {
  test(`Guided #454: Fallback bleibt per Tastatur wiederaufrufbar (${viewport.label}, ${viewport.width}×${viewport.height})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const editor = await reachUnsavedEditorStep(page);

    // No collision-free position exists here: the tooltip collapses instead of
    // covering the tab, and the collapse does not take focus from the editor.
    const hint = page.getByTestId("highlight-hint");
    await expect(hint).toBeVisible();
    await expect(hint).toHaveAttribute("data-state", "collapsed");
    await expect(page.getByTestId("highlight-tooltip")).toBeHidden();
    await expect(editor).toBeFocused();
    await expectStepSurfacesClear(page, editor);

    const toggle = page.getByRole("button", { name: HINT_BUTTON_NAME });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      await toggle.evaluate((element) => getComputedStyle(element).transitionProperty),
      "Mit prefers-reduced-motion bewegt sich der Fallback nicht animiert.",
    ).toBe("none");

    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const controlledId = await toggle.getAttribute("aria-controls");
    expect(controlledId, "Der aufgeklappte Hinweis ist dem Button zugeordnet.").toBeTruthy();
    const hintText = page.locator(`[id="${controlledId}"]`);
    await expect(hintText).toContainText("ungespeicherten Zustand am Punkt im Tab");
    await expect(hint).toHaveAttribute("data-state", "expanded");
    await expectInsideViewport(page, hint, "Der aufgeklappte Hinweis bleibt im Viewport");

    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(hintText).toHaveCount(0);
    await expect(toggle).toBeFocused();

    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await editor.press("Control+s");
    await expectStep(page, 11, "Bereich und Ansichten unterscheiden");
  });
}
