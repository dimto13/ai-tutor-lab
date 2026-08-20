import { expect, test, type Page } from "../fixtures/browser-error-guard";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

async function runResearchRevisions(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Suche 1 · Marktüberblick/ }).click();
  await page.getByRole("button", { name: /Suche 2 · Zeitraum eingrenzen/ }).click();
  await page.getByRole("button", { name: /Suche 3 · Quellen abgleichen/ }).click();
  await page.getByRole("button", { name: /Vergleichstabelle/ }).click();
  await page.getByRole("button", { name: /Kosten ergänzen/ }).click();
}

async function submitTransferRecommendation(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const prompt = page.getByPlaceholder("Ask Copilot...");
  await prompt.fill(
    "Herstellerdokumentation als Primärquelle prüfen, den offiziellen Blog als aktuelle offizielle Sekundärquelle einordnen und den Community-Beitrag wegen seines Alters nur als Kontext nutzen. Meine Empfehlung: vor der Team-Entscheidung den Zahlenwert korrigieren und aktuelle Kosten erneut belegen.",
  );
  await prompt.press("Enter");
}

test("Explore: simulierte Recherche macht Suchfolge, Quellentypen und Prüfstellen frei erkundbar", async ({
  page,
}) => {
  await page.goto("/training/research-workflow.explore");
  await waitForTrainingReady(page);

  await expect(page.getByText("Explorer-Modus", { exact: true })).toBeVisible();
  await expect(page.getByText("Ergebnis · simuliert", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Rechercheprotokoll/ })).toBeVisible();

  await runResearchRevisions(page);
  await page.getByRole("button", { name: /Quelle A · Herstellerdokumentation/ }).click();
  await expect(page.getByText(/80 %/)).toBeVisible();
  await page.getByRole("button", { name: /Quelle B · Community-Beitrag/ }).click();
  await expect(page.getByText(/mehr als drei Jahre alt/)).toBeVisible();
  await page.getByRole("button", { name: /Quelle C · Offizieller Blog/ }).click();
  await expect(page.getByText(/Qualitätsstatus: offizielle Sekundärquelle/)).toBeVisible();
});

test("Guided: Recherche wird iteriert, beide Mängel werden geprüft und Transfer wird formuliert", async ({
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
  await expectGuidedStep(page, 2, "Drei simulierte Suchläufe sichtbar ausführen");
  await page.getByRole("button", { name: "Copilot Chat schließen", exact: true }).click();

  await page.getByRole("button", { name: /Suche 1 · Marktüberblick/ }).click();
  await page.getByRole("button", { name: /Suche 2 · Zeitraum eingrenzen/ }).click();
  await page.getByRole("button", { name: /Suche 3 · Quellen abgleichen/ }).click();
  await expectGuidedStep(page, 3, "Vergleichstabelle iterieren");

  await page.getByRole("button", { name: /Vergleichstabelle/ }).click();
  await page.getByRole("button", { name: /Kosten ergänzen/ }).click();
  await expectGuidedStep(page, 4, "Zahlenwiderspruch zur Quelle erkennen");

  await page.getByRole("button", { name: /Quelle A · Herstellerdokumentation/ }).click();
  await expect(page.getByText(/Simulierter Prüfbenchmark: 8 von 10/)).toBeVisible();
  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expectGuidedStep(page, 5, "Veraltete Community-Quelle erkennen");

  await page.getByRole("button", { name: /Quelle B · Community-Beitrag/ }).click();
  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expectGuidedStep(page, 6, "Aktuellen offiziellen Blog als Kontrollquelle prüfen");

  await page.getByRole("button", { name: /Quelle C · Offizieller Blog/ }).click();
  await expectGuidedStep(page, 7, "Quellen klassifizieren und Empfehlung formulieren");
  await submitTransferRecommendation(page);

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Challenge: Abschluss bleibt gesperrt, bis beide Mängel und der Transfer nachgewiesen sind", async ({
  page,
}) => {
  await page.goto("/training/research-workflow.challenge");
  await waitForTrainingReady(page);

  await runResearchRevisions(page);

  await page.getByRole("button", { name: /Quelle A · Herstellerdokumentation/ }).click();
  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await page.getByRole("button", { name: /Quelle C · Offizieller Blog/ }).click();
  await submitTransferRecommendation(page);

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toHaveCount(0);

  await page.getByRole("button", { name: "Copilot Chat schließen", exact: true }).click();
  await page.getByRole("button", { name: /Quelle B · Community-Beitrag/ }).click();
  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toHaveCount(0);

  await page.getByRole("button", { name: /Quelle C · Offizieller Blog/ }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});
