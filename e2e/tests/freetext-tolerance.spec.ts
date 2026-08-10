import { expect, test, type Page } from "@playwright/test";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

test("Recherche akzeptiert sinngleiche Formulierung ohne Magic Word", async ({ page }) => {
  await page.goto("/training/research-workflow.guided");
  await waitForTrainingReady(page);

  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const prompt = page.getByPlaceholder("Ask Copilot...");
  await prompt.fill(
    "Stelle drei aktuelle Optionen mit Belegen aus dem letzten Jahr tabellarisch gegenüber.",
  );
  await prompt.press("Enter");

  await expect(
    page.getByRole("heading", { name: "Schritt 2 – Drei Suchläufe sichtbar ausführen" }),
  ).toBeVisible();
});

test("HTML-Workflow akzeptiert eigenen Auftrag ohne Begriff Teamübersicht", async ({ page }) => {
  await page.goto("/training/html-page-workflow.guided");
  await waitForTrainingReady(page);

  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const prompt = page.getByPlaceholder("Ask Copilot...");
  await prompt.fill(
    "Erzeuge eine interne Übersicht der Personen mit ihren Namen, Funktionen und Statusangaben.",
  );
  await prompt.press("Enter");

  await expect(
    page.getByRole("heading", { name: "Schritt 2 – Erste Seite als Ergebnis ansehen" }),
  ).toBeVisible();
});
