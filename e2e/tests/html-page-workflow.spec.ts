import { expect, test, type Page } from "@playwright/test";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

const preview = (page: Page) =>
  page.frameLocator('iframe[title="Vorschau: Projekt Atlas · Teamübersicht"]');

test("HTML-Seiten-Workflow ist im Explore-Modus verfügbar", async ({ page }) => {
  await page.goto("/training/html-page-workflow.explore");
  await waitForTrainingReady(page);

  await expect(page.getByText("Explorer-Modus", { exact: true })).toBeVisible();
  await expect(page.getByText("Ergebnis · simuliert", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Projekt Atlas · Teamübersicht/ })).toBeVisible();
});

test("Guided: Seite wird dreifach iteriert, im Quelltext geprüft und ein stiller Verlust erkannt", async ({
  page,
}) => {
  await page.goto("/training/html-page-workflow.guided");
  await waitForTrainingReady(page);
  await expectGuidedStep(page, 1, "Auftrag in eigenen Worten formulieren");

  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const copilotPrompt = page.getByPlaceholder("Ask Copilot...");
  await copilotPrompt.fill(
    "Erstelle eine interne Teamübersicht mit Name, Rolle und Status für Projekt Atlas.",
  );
  await copilotPrompt.press("Enter");
  await expectGuidedStep(page, 2, "Erste Seite als Ergebnis ansehen");
  await page.getByRole("button", { name: "Copilot Chat schließen", exact: true }).click();

  await page.getByRole("button", { name: /Projekt Atlas · Teamübersicht/ }).click();
  await expectGuidedStep(page, 3, "Revision 1: Inhalt ergänzen");
  await page.getByRole("button", { name: /Mika Scholz ergänzen/ }).click();
  await expect(preview(page).getByText("Mika Scholz")).toBeVisible();
  await expectGuidedStep(page, 4, "Revision 2: Darstellung ändern");

  await page.getByRole("button", { name: /Als Tabelle darstellen/ }).click();
  await expect(preview(page).getByRole("columnheader", { name: "Name" })).toBeVisible();
  await expect(preview(page).getByText("Nora Berger")).toBeVisible();
  await expectGuidedStep(page, 5, "Vorschau und Quelltext bewusst wechseln");

  await page.getByRole("button", { name: "Quelltext", exact: true }).click();
  await expect(page.getByText("<table>", { exact: false })).toBeVisible();
  await expectGuidedStep(page, 6, "Zur gerenderten Seite zurückkehren");
  await page.getByRole("button", { name: "Vorschau", exact: true }).click();
  await expectGuidedStep(page, 7, "Revision 3: Verhalten ergänzen");

  await page.getByRole("button", { name: /Sprunglink ergänzen/ }).click();
  await expect(preview(page).getByRole("link", { name: "Zum Seitenanfang" })).toBeVisible();
  await preview(page).getByRole("link", { name: "Zum Seitenanfang" }).click();
  await expect(preview(page).getByText("Mika Scholz")).toBeVisible();
  await expect(preview(page).getByText("Nora Berger")).toHaveCount(0);
  await expectGuidedStep(page, 8, "Stillen Verlust selbst erkennen");

  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  await copilotPrompt.fill("Nora Berger fehlt in der aktuellen Tabelle.");
  await copilotPrompt.press("Enter");
  await expectGuidedStep(page, 9, "Erkannten Verlust gezielt korrigieren");
  await page.getByRole("button", { name: "Copilot Chat schließen", exact: true }).click();

  await page.getByRole("button", { name: /Gefundenen Verlust korrigieren/ }).click();
  await expect(preview(page).getByText("Nora Berger")).toBeVisible();
  await expectGuidedStep(page, 10, "Endstand fachlich prüfen");

  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expectGuidedStep(page, 11, "Einsatzgrenzen einordnen");
  await page.getByRole("button", { name: "Konzept verstanden", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Challenge: Abschluss gelingt erst nach Korrektur des stillen Verlusts und finaler Prüfung", async ({
  page,
}) => {
  await page.goto("/training/html-page-workflow.challenge");
  await waitForTrainingReady(page);

  await page.getByRole("button", { name: /Mika Scholz ergänzen/ }).click();
  await page.getByRole("button", { name: /Als Tabelle darstellen/ }).click();
  await page.getByRole("button", { name: /Sprunglink ergänzen/ }).click();

  await expect(preview(page).getByText("Nora Berger")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toHaveCount(0);

  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const copilotPrompt = page.getByPlaceholder("Ask Copilot...");
  await copilotPrompt.fill("Nora Berger fehlt in der aktuellen Tabelle.");
  await copilotPrompt.press("Enter");
  await page.getByRole("button", { name: "Copilot Chat schließen", exact: true }).click();

  await page.getByRole("button", { name: /Gefundenen Verlust korrigieren/ }).click();
  await expect(preview(page).getByText("Nora Berger")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toHaveCount(0);

  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});
