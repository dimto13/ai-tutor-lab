import { expect, test, type Page } from "../fixtures/browser-error-guard";

const scenarioUrl = "/training/quarterly-presentation-workflow.guided";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

test("Quartalspräsentation: A/B-Vergleich führt bis zur fachlichen Prüfung", async ({ page }) => {
  await page.goto(scenarioUrl);
  await waitForTrainingReady(page);

  await page.getByRole("button", { name: /Durchlauf A – freier Auftrag/ }).click();
  await expect(page.getByText(/zusätzliche Kapazität freigeben/)).toBeVisible();

  await page.getByRole("button", { name: /Durchlauf B – mit Presentation-Skill/ }).click();
  await expect(page.getByText(/keine Q4-Prognose/)).toBeVisible();

  await page.getByRole("button", { name: /Qualitätsvergleich A\/B/ }).click();
  await expect(page.getByRole("cell", { name: "Nachvollziehbarkeit" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Bearbeitbarkeit" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Quellenbezug" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Visuelle Qualität" })).toBeVisible();

  await page.getByRole("button", { name: /Prüfprotokoll/ }).click();
  await expect(page.getByText(/Kapazitätsfreigabe/)).toBeVisible();
  await expect(page.getByText(/gelten als Fehler/)).toBeVisible();
  await expect(
    page.getByText(/Fakten, Interpretation und Entscheidung sichtbar trennen/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});
