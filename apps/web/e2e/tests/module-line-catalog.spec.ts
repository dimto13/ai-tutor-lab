import { expect, test } from "../fixtures/browser-error-guard";

test("Trainingskatalog zeigt KI-Workflows als erkennbare Modullinie", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "KI-Workflows in der Praxis", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Realistische Arbeitsabläufe mit KI durchführen, sichtbare Arbeitsprodukte iterieren und Ergebnisse aktiv fachlich prüfen.",
      { exact: true },
    ),
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "VS Code, Git & GitHub Copilot – Zusammenspiel" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Mit KI recherchieren und Quellen prüfen" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "HTML-Seite mit KI erstellen und iterativ verbessern" }),
  ).toBeVisible();
});
