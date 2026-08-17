import { expect, test, type Page } from "../fixtures/browser-error-guard";

const exploreUrl = "/training/vscode-basics.explore";

async function openExplore(page: Page): Promise<void> {
  await page.goto(exploreUrl);
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectProgress(page: Page, completed: number): Promise<void> {
  await expect(
    page.getByText(`${completed} von 23 Oberflächen untersucht`, { exact: true }),
  ).toBeVisible();
}

async function openFileMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "File", exact: true }).click();
}

async function openTerminalMenu(page: Page): Promise<void> {
  await page.locator('[data-highlight="vscode.menu.terminal"]').click();
}

function terminalPanelTab(page: Page) {
  return page.locator('[data-highlight="vscode.panel.terminal"]');
}

async function expectExploreTargetDone(page: Page, label: string): Promise<void> {
  const row = page.getByRole("listitem").filter({
    has: page.getByText(label, { exact: true }),
  });
  await expect(row).toHaveCount(1);
  await expect(row.locator("svg")).toHaveClass(/text-success/);
}

test("Explore: frischer VS-Code-Walkthrough erreicht über sichtbare Fachaktionen 100 Prozent", async ({
  page,
}) => {
  await openExplore(page);
  await expectProgress(page, 0);

  const menus = ["File", "Edit", "Selection", "View", "Go", "Run", "Terminal", "Help"];
  for (const label of menus) {
    await page.getByRole("button", { name: label, exact: true }).click();
  }
  await expectProgress(page, 8);

  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: /Command Palette/ }).click();
  await expect(page.getByRole("dialog", { name: "Command Palette" })).toBeVisible();
  await expectProgress(page, 9);
  await page.keyboard.press("Escape");

  await openFileMenu(page);
  await page.getByRole("menuitem", { name: "Preferences", exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await expectProgress(page, 10);
  await page.getByRole("button", { name: "Settings schließen" }).click();

  for (const label of ["Explorer", "Suche", "Source Control", "Extensions"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
  }
  await expectProgress(page, 14);

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await page.getByRole("button", { name: "ai-training-demo", exact: true }).click();
  await expectProgress(page, 17);
  await expectExploreTargetDone(page, "Primary Side Bar");
  await expectExploreTargetDone(page, "Workspace-Kontext");
  await expectExploreTargetDone(page, "Status Bar");

  await page.getByRole("button", { name: "README.md", exact: true }).click();
  await expectProgress(page, 18);
  await expectExploreTargetDone(page, "Editor");

  await openFileMenu(page);
  await page.getByRole("menuitem", { name: /Open Folder\.\.\./ }).click();
  await expectProgress(page, 19);

  await openFileMenu(page);
  await page.getByRole("menuitem", { name: /Open Workspace from File\.\.\./ }).click();
  await expectProgress(page, 20);

  await openTerminalMenu(page);
  await page
    .getByRole("menuitem", { name: /New Terminal/ })
    .first()
    .click();
  await expectProgress(page, 21);

  await page.getByRole("button", { name: "Problems", exact: true }).click();
  await expectProgress(page, 22);

  await page.getByRole("button", { name: "Output", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Explore: Primary Side Bar zählt über eine sichtbare View-Aktion statt über den Container", async ({
  page,
}) => {
  await openExplore(page);

  await page.getByRole("complementary", { name: "Primary Side Bar" }).click();
  await expectProgress(page, 0);

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expectProgress(page, 1);

  await page.getByRole("button", { name: "ai-training-demo", exact: true }).click();
  await expectProgress(page, 4);
  await expectExploreTargetDone(page, "Primary Side Bar");
});

test("Explore: Workspace-Kontext zählt über File → Open Workspace und nicht über einen Fortschritts-Klick", async ({
  page,
}) => {
  await openExplore(page);

  await openFileMenu(page);
  await page.getByRole("menuitem", { name: /Open Workspace from File\.\.\./ }).click();
  await expectProgress(page, 5);
  await expectExploreTargetDone(page, "Workspace-Kontext");

  await page.locator('[data-highlight="vscode.workspace.context"]').click();
  await expectProgress(page, 5);
});

test("Explore: Terminal → New Terminal erschließt semantisch das Terminal-Panel", async ({
  page,
}) => {
  await openExplore(page);

  await openTerminalMenu(page);
  await page
    .getByRole("menuitem", { name: /New Terminal/ })
    .first()
    .click();

  await expect(page.getByRole("textbox", { name: "Terminal-Eingabe" })).toBeVisible();
  await expectProgress(page, 2);
});

test("Explore: direkter Terminal-Panel-Tab erschließt denselben Terminal-Zustand", async ({
  page,
}) => {
  await openExplore(page);

  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: "Problems", exact: true }).click();
  await expectProgress(page, 2);

  await terminalPanelTab(page).click();
  await expect(page.getByRole("textbox", { name: "Terminal-Eingabe" })).toBeVisible();
  await expectProgress(page, 3);
});

test("Explore: äquivalente Terminal-Einstiege zählen das Ziel nur einmal", async ({ page }) => {
  await openExplore(page);

  await openTerminalMenu(page);
  await page
    .getByRole("menuitem", { name: /New Terminal/ })
    .first()
    .click();
  await expectProgress(page, 2);

  await terminalPanelTab(page).click();
  await expectProgress(page, 2);

  await page.getByRole("button", { name: "View", exact: true }).click();
  await expectProgress(page, 3);
  await page.getByRole("menuitem", { name: "Terminal", exact: true }).click();
  await expectProgress(page, 3);
});
