import { expect, test, type Locator, type Page } from "@playwright/test";

async function ready(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectStep(page: Page, number: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${number} – ${title}` })).toBeVisible();
}

async function intersectionArea(left: Locator, right: Locator): Promise<number | null> {
  const [leftBox, rightBox] = await Promise.all([left.boundingBox(), right.boundingBox()]);
  if (!leftBox || !rightBox) return null;
  const width = Math.max(
    0,
    Math.min(leftBox.x + leftBox.width, rightBox.x + rightBox.width) -
      Math.max(leftBox.x, rightBox.x),
  );
  const height = Math.max(
    0,
    Math.min(leftBox.y + leftBox.height, rightBox.y + rightBox.height) -
      Math.max(leftBox.y, rightBox.y),
  );
  return width * height;
}

async function reachOpenTerminal(page: Page): Promise<void> {
  await page.goto("/training/vscode-basics.guided");
  await ready(page);
  await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
  await expectStep(page, 7, "Explorer öffnen");

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expectStep(page, 8, "Einen Ordner als Arbeitskontext öffnen");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /Open Folder\.\.\./ }).click();
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

test("Guided: Spotlight-Tooltip lässt Terminal → New Terminal vollständig frei", async ({
  page,
}) => {
  await reachOpenTerminal(page);

  const tooltip = page.getByTestId("highlight-tooltip");
  await expect(tooltip).toBeVisible();

  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  const terminalMenu = page.getByRole("menu", { name: "Terminal menu" });
  const newTerminal = terminalMenu.getByRole("menuitem", { name: /New Terminal/ }).first();
  await expect(terminalMenu).toBeVisible();
  await expect(newTerminal).toBeVisible();
  await expect(newTerminal).toBeInViewport();
  await expect(tooltip).toBeVisible();

  await expect.poll(() => intersectionArea(tooltip, terminalMenu)).toBe(0);

  const itemBox = await newTerminal.boundingBox();
  const viewport = page.viewportSize();
  expect(itemBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (itemBox && viewport) {
    expect(itemBox.x).toBeGreaterThanOrEqual(0);
    expect(itemBox.y).toBeGreaterThanOrEqual(0);
    expect(itemBox.x + itemBox.width).toBeLessThanOrEqual(viewport.width);
    expect(itemBox.y + itemBox.height).toBeLessThanOrEqual(viewport.height);
  }

  await newTerminal.click();
  await expectStep(page, 12, "Problems-View verwenden");
  await expect(page.getByLabel("Terminal-Eingabe")).toBeVisible();
});
