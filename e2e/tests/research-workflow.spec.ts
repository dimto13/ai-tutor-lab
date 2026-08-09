import { expect, test, type Page } from "@playwright/test";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

test("Recherche-Workflow ist im Explore-Modus verfügbar", async ({ page }) => {
  await page.goto("/training/research-workflow.explore");
  await waitForTrainingReady(page);

  await expect(page.getByText("Explorer-Modus", { exact: true })).toBeVisible();
  await expect(page.getByText("Ergebnis · simuliert", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Rechercheprotokoll/ })).toBeVisible();
});

test("Guided: Recherche wird iteriert und beide eingebauten Quellenmängel werden geprüft", async ({
  page,
}) => {
  await page.goto("/training/research-workflow.guided");
  await waitForTrainingReady(page);
  await expectGuidedStep(page, 1, "Rechercheauftrag selbst formulieren");

  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const copilotPrompt = page.getByPlaceholder("Ask Copilot...");
  await copilotPrompt.fill(
    "Vergleiche drei Optionen der letzten 12 Monate als Vergleichstabelle mit Quellen.",
  );
  await copilotPrompt.press("Enter");
  await expectGuidedStep(page, 2, "Drei Suchläufe sichtbar ausführen");

  await page.getByRole("button", { name: /Suche 1 · Marktüberblick/ }).click();
  await page.getByRole("button", { name: /Suche 2 · Zeitraum eingrenzen/ }).click();
  await page.getByRole("button", { name: /Suche 3 · Quellen abgleichen/ }).click();
  await expectGuidedStep(page, 3, "Vergleichstabelle iterieren");

  await page.getByRole("button", { name: /Vergleichstabelle/ }).click();
  await page.getByRole("button", { name: /Kosten ergänzen/ }).click();
  await expectGuidedStep(page, 4, "Unbelegte Aussage erkennen");

  await page.getByRole("button", { name: /Quelle A · Produktseite/ }).click();
  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expectGuidedStep(page, 5, "Veraltete Quelle erkennen");

  await page.getByRole("button", { name: /Quelle B · Marktübersicht/ }).click();
  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expectGuidedStep(page, 6, "Kontrollquelle prüfen");

  await page.getByRole("button", { name: /Quelle C · Anbieterinfo/ }).click();
  await expectGuidedStep(page, 7, "MCP, Agent und Quelle einordnen");
  await page.getByRole("button", { name: "Konzept verstanden", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Challenge: Abschluss gelingt nur mit drei Suchläufen, Iteration und exakt zwei Mängeln", async ({
  page,
}) => {
  await page.goto("/training/research-workflow.challenge");
  await waitForTrainingReady(page);

  await page.getByRole("button", { name: /Suche 1 · Marktüberblick/ }).click();
  await page.getByRole("button", { name: /Suche 2 · Zeitraum eingrenzen/ }).click();
  await page.getByRole("button", { name: /Suche 3 · Quellen abgleichen/ }).click();
  await page.getByRole("button", { name: /Vergleichstabelle/ }).click();
  await page.getByRole("button", { name: /Kosten ergänzen/ }).click();

  await page.getByRole("button", { name: /Quelle A · Produktseite/ }).click();
  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await page.getByRole("button", { name: /Quelle B · Marktübersicht/ }).click();
  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toHaveCount(0);
  await page.getByRole("button", { name: /Quelle C · Anbieterinfo/ }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});
