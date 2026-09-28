import { expect, test, type Page } from "../fixtures/browser-error-guard";

const guidedUrl = "/training/brownfield-dashboard-repair.guided";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

test("Dashboard führt den Brownfield-Workflow als eigenes Training der Modullinie auf", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "KI-Workflows in der Praxis", exact: true }),
  ).toBeVisible();

  const card = page.getByRole("article").filter({
    hasText: "Wartungsdashboard gezielt reparieren und absichern",
  });
  await expect(card).toBeVisible();
  await expect(card.getByText("AI Workflow · 3 Modi", { exact: true })).toBeVisible();
  await expect(card.getByRole("link", { name: /Explore/ })).toBeVisible();
  await expect(card.getByRole("link", { name: /Guided/ })).toBeVisible();
  await expect(card.getByRole("link", { name: /Challenge/ })).toBeVisible();

  await card.getByRole("link", { name: /Guided/ }).click();
  await expect(page).toHaveURL(/\/training\/brownfield-dashboard-repair\.guided$/);
  await waitForTrainingReady(page);
});

test("Guided: Bestand wird vor der Mutation analysiert, Defekte einzeln behoben und die Regression erkannt", async ({
  page,
}) => {
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);

  await expectGuidedStep(page, 1, "Vorhandenen Code zuerst analysieren");
  const sidebar = page.getByLabel("Primary Side Bar");
  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await sidebar.getByRole("button", { name: "dashboard.html", exact: true }).click();

  await expectGuidedStep(page, 2, "Symptome mit den Daten abgleichen");
  await sidebar.getByRole("button", { name: "anlagen.json", exact: true }).click();

  await expectGuidedStep(page, 3, "Defekt 1 isoliert reparieren");
  await page.getByRole("button", { name: "Nur Verfügbarkeit korrigieren", exact: true }).click();

  await expectGuidedStep(page, 4, "Erste Korrektur im Browser prüfen");
  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();

  await expectGuidedStep(page, 5, "Defekt 2 getrennt reparieren");
  await page.getByRole("button", { name: "Nur offene Störungen korrigieren", exact: true }).click();

  await expectGuidedStep(page, 6, "Zweite Korrektur im Browser prüfen");
  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();

  await expectGuidedStep(page, 7, "30-Tage-Wartungsübersicht ergänzen");
  await page.getByRole("button", { name: "30-Tage-Wartungsansicht ergänzen", exact: true }).click();

  await expectGuidedStep(page, 8, "Regression erkennen und gezielt beheben");
  await page.getByRole("button", { name: "Regression gezielt reparieren", exact: true }).click();

  await expectGuidedStep(page, 9, "Alt- und Neufunktion gemeinsam prüfen");
  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();

  await expectGuidedStep(page, 10, "Übertragbare Projektregeln sichern");
  await page.getByRole("button", { name: /Projekt- und Gestaltungsregeln/ }).click();

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Explore: Bestand, Reparaturen und Regression bleiben frei erkundbar", async ({ page }) => {
  await page.goto("/training/brownfield-dashboard-repair.explore");
  await waitForTrainingReady(page);

  await expect(page.getByText("0 von 4 erkundet", { exact: true })).toBeVisible();

  const sidebar = page.getByLabel("Primary Side Bar");
  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await sidebar.getByRole("button", { name: "dashboard.html", exact: true }).click();

  await page
    .getByRole("button", { name: "Nur Verf\u00fcgbarkeit korrigieren", exact: true })
    .click();
  await page.getByRole("button", { name: "Ergebnis gepr\u00fcft", exact: true }).click();

  await expect(page.getByText(/von 4 erkundet/)).toBeVisible();
  await expect(page.getByText("0 von 4 erkundet", { exact: true })).toHaveCount(0);
});

test("Challenge: nur der gepr\u00fcfte Endzustand ohne Regression schlie\u00dft das Training ab", async ({
  page,
}) => {
  await page.goto("/training/brownfield-dashboard-repair.challenge");
  await waitForTrainingReady(page);

  await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: "Nur Verf\u00fcgbarkeit korrigieren", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nur offene St\u00f6rungen korrigieren", exact: true })
    .click();
  await page
    .getByRole("button", { name: "30-Tage-Wartungsansicht erg\u00e4nzen", exact: true })
    .click();

  // The maintenance window deliberately drops A-305; verifying here must not finish the run.
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toHaveCount(0);

  await page.getByRole("button", { name: "Regression gezielt reparieren", exact: true }).click();
  await page.getByRole("button", { name: "Ergebnis gepr\u00fcft", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});
