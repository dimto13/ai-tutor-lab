import { expect, test, type Locator, type Page } from "../fixtures/browser-error-guard";
import { expectGuidedActionTargetUnobstructed } from "../helpers/guided-overlay-obstruction";

async function ready(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectStep(page: Page, number: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${number} – ${title}` })).toBeVisible();
}

async function expectInsideViewport(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) return;

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

async function reachOpenTerminal(page: Page): Promise<void> {
  await page.goto("/training/vscode-basics.guided");
  await ready(page);
  await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
  await expectStep(page, 7, "Explorer öffnen");

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expectStep(page, 8, "Einen Ordner als Arbeitskontext öffnen");

  await page.getByRole("button", { name: "File", exact: true }).click();
  const fileMenu = page.getByRole("menu", { name: "File menu" });
  const openFolder = fileMenu.getByRole("menuitem", { name: /Open Folder\.\.\./ });
  await expect(fileMenu).toBeVisible();
  await expectGuidedActionTargetUnobstructed(page, {
    name: "File → Open Folder…",
    locator: openFolder,
  });
  await openFolder.click();
  await expectStep(page, 9, "Datei erstellen");

  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  const filename = page.getByPlaceholder("dateiname.ext");
  await filename.fill("notiz.txt");
  await filename.press("Enter");
  await expectStep(page, 10, "Datei bearbeiten und speichern");

  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.fill("Hello AI Training");
  await editor.press("Control+s");
  await expectStep(page, 11, "Panel und seine Views unterscheiden");
}

test("Guided: handlungsrelevante transiente Ziele bleiben frei von Plattform-Overlays", async ({
  page,
}) => {
  await reachOpenTerminal(page);

  const tooltip = page.getByTestId("highlight-tooltip");
  await expect(tooltip).toBeVisible();

  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  const terminalMenu = page.getByRole("menu", { name: "Terminal menu" });
  const newTerminal = terminalMenu.getByRole("menuitem", { name: /^New Terminal/ }).first();
  await expect(terminalMenu).toBeVisible();
  await expect(newTerminal).toBeVisible();
  await expect(newTerminal).toBeInViewport();
  await expectGuidedActionTargetUnobstructed(page, {
    name: "Terminal → New Terminal",
    locator: newTerminal,
  });
  await expectInsideViewport(page, newTerminal);

  const profileEntry = terminalMenu.getByRole("menuitem", { name: /New Terminal with Profile/ });
  await profileEntry.hover();
  const profileSubmenu = page.getByRole("menu", { name: "New Terminal with Profile submenu" });
  await expect(profileSubmenu).toBeVisible();
  await expectGuidedActionTargetUnobstructed(page, {
    name: "Terminal → New Terminal with Profile submenu",
    locator: profileSubmenu,
  });

  await page.getByRole("button", { name: "View", exact: true }).click();
  const viewMenu = page.getByRole("menu", { name: "View menu" });
  await viewMenu.getByRole("menuitem", { name: /Command Palette\.\.\./ }).click();
  const commandPalette = page.getByRole("dialog", { name: "Command Palette" });
  await expect(commandPalette).toBeVisible();
  await expectGuidedActionTargetUnobstructed(page, {
    name: "Command Palette dialog",
    locator: commandPalette,
  });
  await page.getByLabel("Command Palette-Eingabe").press("Escape");
  await expect(commandPalette).toBeHidden();

  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  const reopenedTerminalMenu = page.getByRole("menu", { name: "Terminal menu" });
  const reopenedNewTerminal = reopenedTerminalMenu
    .getByRole("menuitem", { name: /^New Terminal/ })
    .first();
  await expectGuidedActionTargetUnobstructed(page, {
    name: "Terminal → New Terminal",
    locator: reopenedNewTerminal,
  });
  await reopenedNewTerminal.click();

  await expectStep(page, 12, "Problems-View verwenden");
  await expect(page.getByLabel("Terminal-Eingabe")).toBeVisible();
});
