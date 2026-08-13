import { expect, test, type Page } from "@playwright/test";

async function openExplore(page: Page): Promise<void> {
  await page.goto("/training/vscode-basics.explore");
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

test("VS Code Grundlagen: Command Palette startet passende Oberflächenbefehle", async ({
  page,
}) => {
  await openExplore(page);

  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: /Command Palette/ }).click();

  const palette = page.getByRole("dialog", { name: "Command Palette" });
  await expect(palette).toBeVisible();
  await expect(page.getByLabel("Command Palette-Eingabe")).toHaveValue(">");
  await expect(palette.getByText(/sucht und startet VS-Code-Befehle/)).toBeVisible();

  await palette.getByRole("button", { name: "Search: Show Search" }).click();
  await expect(page.getByText("Volltextsuche über den aktuellen Arbeitskontext.")).toBeVisible();
});

test("VS Code Grundlagen: Settings und Extensions bleiben fachlich getrennt", async ({ page }) => {
  await openExplore(page);

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Preferences", exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();

  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  await expect(settings.getByText(/Einstellungen verändern das Verhalten von VS Code/)).toBeVisible();
  await expect(settings.getByText(/Extensions erweitern dagegen den Funktionsumfang/)).toBeVisible();
  await page.getByRole("button", { name: "Settings schließen" }).click();

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Preferences", exact: true }).click();
  await page.getByRole("menuitem", { name: "Extensions", exact: true }).click();
  await expect(page.getByText("GitHub Copilot", { exact: true })).toBeVisible();
});
