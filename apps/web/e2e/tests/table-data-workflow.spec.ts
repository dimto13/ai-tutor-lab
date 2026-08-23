import { expect, test, type Page } from "../fixtures/browser-error-guard";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

async function selectArtifact(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("button", { name }).click();
}

async function verifyRule(page: Page, name: RegExp): Promise<void> {
  await selectArtifact(page, name);
  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
}

async function selectWorkingTable(page: Page): Promise<void> {
  await selectArtifact(page, /Arbeitstabelle|Auswertung/);
}

const table = (page: Page) => page.locator('[data-highlight="artifact.preview.table"]');

test("Tabellendaten-Workflow ist in Explore, Guided und Challenge direkt verfügbar", async ({
  page,
}) => {
  for (const mode of ["explore", "guided", "challenge"] as const) {
    await page.goto(`/training/table-data-workflow.${mode}`);
    await waitForTrainingReady(page);
    await expect(page.getByText("Ergebnis · simuliert", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Synthetische Ausgangsdaten/ })).toBeVisible();
  }
});

test("Guided: Annahmen werden einzeln bestätigt, Zwischenstände sichtbar und Ost muss gefunden werden", async ({
  page,
}) => {
  await page.goto("/training/table-data-workflow.guided");
  await waitForTrainingReady(page);
  await expectGuidedStep(page, 1, "Auswertung fachlich beauftragen");

  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const copilotPrompt = page.getByPlaceholder("Ask Copilot...");
  await copilotPrompt.fill(
    "Werte den synthetischen Umsatz nach Region und Quartal aus und behandle Retouren nachvollziehbar.",
  );
  await copilotPrompt.press("Enter");
  await expectGuidedStep(page, 2, "Unveränderte Referenz ansehen");
  await page.getByRole("button", { name: "Copilot Chat schließen", exact: true }).click();

  await selectArtifact(page, /Synthetische Ausgangsdaten/);
  await expectGuidedStep(page, 3, "Bereinigungsregel 1 einzeln bestätigen");
  await verifyRule(page, /Bereinigungsregel 1 · Regionen/);
  await expectGuidedStep(page, 4, "Zwischenstand 1: Regionen bereinigen");
  await selectWorkingTable(page);
  await page.getByRole("button", { name: /Regionsschreibweisen vereinheitlichen/ }).click();
  await expect(table(page).getByText("NORD", { exact: true })).toHaveCount(0);

  await expectGuidedStep(page, 5, "Bereinigungsregel 2 einzeln bestätigen");
  await verifyRule(page, /Bereinigungsregel 2 · Datum/);
  await expectGuidedStep(page, 6, "Zwischenstand 2: Datum und Quartal bereinigen");
  await selectWorkingTable(page);
  await page.getByRole("button", { name: /Datumsformate und Quartale vereinheitlichen/ }).click();
  await expect(table(page).getByRole("columnheader", { name: "Quartal" })).toBeVisible();

  await expectGuidedStep(page, 7, "Bereinigungsregel 3 einzeln bestätigen");
  await verifyRule(page, /Bereinigungsregel 3 · Beträge und Retouren/);
  await expectGuidedStep(page, 8, "Zwischenstand 3: Beträge numerisch bereinigen");
  await selectWorkingTable(page);
  await page.getByRole("button", { name: /Beträge und Retouren numerisch bereinigen/ }).click();
  await expect(table(page).getByText("-10000", { exact: true })).toBeVisible();

  await expectGuidedStep(page, 9, "Zwischenwerte je Quartal berechnen");
  await page.getByRole("button", { name: /Umsatz je Region und Quartal berechnen/ }).click();
  await expect(table(page).getByText("350000", { exact: true })).toBeVisible();
  await expect(table(page).getByText("Ost", { exact: true })).toBeVisible();

  await expectGuidedStep(page, 10, "Iteration: ohne Retouren rechnen");
  await page.getByRole("button", { name: /Iteration · ohne Retouren rechnen/ }).click();
  await expect(table(page).getByText("510000", { exact: true })).toBeVisible();
  await expect(table(page).getByText("Ost", { exact: true })).toHaveCount(0);
  await expectGuidedStep(page, 11, "Vollständigkeitsfehler selbst finden");

  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  await copilotPrompt.fill("Ost fehlt in der aktuellen Auswertung.");
  await copilotPrompt.press("Enter");
  await expectGuidedStep(page, 12, "Gefundenen Verlust korrigieren");
  await page.getByRole("button", { name: "Copilot Chat schließen", exact: true }).click();

  await page.getByRole("button", { name: /Gefundene Region wiederherstellen/ }).click();
  await expect(table(page).getByText("Ost", { exact: true })).toBeVisible();
  await expect(table(page).getByText("350000", { exact: true })).toBeVisible();
  await expectGuidedStep(page, 13, "Korrigierten Endstand fachlich prüfen");

  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expectGuidedStep(page, 14, "Datenklassifizierung und Verantwortung einordnen");
  await expect(page.getByText(/ausschließlich synthetische Daten/)).toBeVisible();
  await page.getByRole("button", { name: "Konzept verstanden", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Challenge: ein vorzeitiger Check reicht nicht; Ost muss vor Korrektur und finaler Prüfung benannt werden", async ({
  page,
}) => {
  await page.goto("/training/table-data-workflow.challenge");
  await waitForTrainingReady(page);

  await verifyRule(page, /Bereinigungsregel 1 · Regionen/);
  await selectWorkingTable(page);
  await page.getByRole("button", { name: /Regionsschreibweisen vereinheitlichen/ }).click();

  await verifyRule(page, /Bereinigungsregel 2 · Datum/);
  await selectWorkingTable(page);
  await page.getByRole("button", { name: /Datumsformate und Quartale vereinheitlichen/ }).click();

  await verifyRule(page, /Bereinigungsregel 3 · Beträge und Retouren/);
  await selectWorkingTable(page);
  await page.getByRole("button", { name: /Beträge und Retouren numerisch bereinigen/ }).click();
  await page.getByRole("button", { name: /Umsatz je Region und Quartal berechnen/ }).click();
  await page.getByRole("button", { name: /Iteration · ohne Retouren rechnen/ }).click();

  await expect(table(page).getByText("Ost", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toHaveCount(0);

  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const copilotPrompt = page.getByPlaceholder("Ask Copilot...");
  await copilotPrompt.fill("Ost fehlt in der aktuellen Auswertung.");
  await copilotPrompt.press("Enter");
  await page.getByRole("button", { name: "Copilot Chat schließen", exact: true }).click();

  await page.getByRole("button", { name: /Gefundene Region wiederherstellen/ }).click();
  await expect(table(page).getByText("Ost", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toHaveCount(0);

  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});
