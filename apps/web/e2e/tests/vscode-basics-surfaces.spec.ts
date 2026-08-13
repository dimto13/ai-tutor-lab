import { expect, test, type Page } from "@playwright/test";

async function openExplore(page: Page): Promise<void> {
  await page.goto("/training/vscode-basics.explore");
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

test("VS Code Grundlagen: Command Palette filtert, zählt als Lernoberfläche und startet Befehle per Tastatur", async ({
  page,
}) => {
  await openExplore(page);

  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: /Command Palette/ }).click();

  const palette = page.getByRole("dialog", { name: "Command Palette" });
  const input = page.getByLabel("Command Palette-Eingabe");
  await expect(palette).toBeVisible();
  await expect(page.getByText("2 von 23 Oberflächen untersucht", { exact: true })).toBeVisible();
  await expect(input).toHaveValue(">");
  await expect(palette.getByText(/sucht und startet VS-Code-Befehle/)).toBeVisible();

  await input.fill(">search");
  await expect(palette.getByRole("option", { name: "Search: Show Search" })).toBeVisible();
  await input.press("Enter");
  await expect(page.getByText("Volltextsuche über den aktuellen Arbeitskontext.")).toBeVisible();
});

test("VS Code Grundlagen: Settings zählen als Lernoberfläche und bleiben von Extensions getrennt", async ({
  page,
}) => {
  await openExplore(page);

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Preferences", exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();

  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  await expect(page.getByText("2 von 23 Oberflächen untersucht", { exact: true })).toBeVisible();
  await expect(
    settings.getByText(/Einstellungen verändern das Verhalten von VS Code/),
  ).toBeVisible();
  await expect(
    settings.getByText(/Extensions erweitern dagegen den Funktionsumfang/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings schließen" }).click();

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Preferences", exact: true }).click();
  await page.getByRole("menuitem", { name: "Extensions", exact: true }).click();
  await expect(page.getByText("GitHub Copilot", { exact: true })).toBeVisible();
  await expect(page.getByText("3 von 23 Oberflächen untersucht", { exact: true })).toBeVisible();
});

test("VS Code Grundlagen: neue Explorer-Datei wird erst nach Bearbeitung als ungespeichert markiert", async ({
  page,
}) => {
  await page.goto("/training/vscode-basics.challenge");
  await expect(page.getByRole("status")).toHaveText("Training bereit");

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /Open Folder\.\.\./ }).click();
  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.ext").fill("challenge.txt");
  await page.getByPlaceholder("dateiname.ext").press("Enter");

  const dirtyStatus = page.getByRole("status", {
    name: "challenge.txt: ungespeicherte Änderungen",
  });
  await expect(dirtyStatus).toHaveCount(0);

  await page.getByRole("textbox", { name: "Editor-Inhalt" }).fill("noch nicht fertig");
  await expect(dirtyStatus).toBeVisible();
});

test("VS Code Grundlagen: sichtbarer File-Save-Befehl speichert die aktive Datei", async ({
  page,
}) => {
  await page.goto("/training/vscode-basics.challenge");
  await expect(page.getByRole("status")).toHaveText("Training bereit");

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /Open Folder\.\.\./ }).click();
  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.ext").fill("challenge.txt");
  await page.getByPlaceholder("dateiname.ext").press("Enter");

  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  const dirtyStatus = page.getByRole("status", {
    name: "challenge.txt: ungespeicherte Änderungen",
  });
  await editor.fill("VS Code Grundlagen abgeschlossen");
  await expect(dirtyStatus).toBeVisible();
  await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save Ctrl+S", exact: true }).click();

  await expect(dirtyStatus).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});
