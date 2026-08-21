import { expect, test, type Page } from "../fixtures/browser-error-guard";

const exploreUrl = "/training/claude-code-basics.explore";
const guidedUrl = "/training/claude-code-basics.guided";
const challengeUrl = "/training/claude-code-basics.challenge";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

async function sendInput(page: Page, text: string): Promise<void> {
  await page.getByRole("textbox", { name: "Eingabezeile" }).fill(text);
  await page.getByRole("textbox", { name: "Eingabezeile" }).press("Enter");
}

async function rejectUnsafeProposal(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Vorschlag ansehen" }).click();
  await expect(page.getByText(/DEMO_TOKEN=TRAINING-ONLY-SECRET/)).toBeVisible();
  await page.getByRole("button", { name: "Ablehnen" }).click();
}

async function completeSafeChallenge(page: Page): Promise<void> {
  await rejectUnsafeProposal(page);
  await sendInput(page, "Übernimm den Status sicher aus docs/status ohne Geheimnisse");
  await page.getByRole("button", { name: "Plan prüfen" }).click();
  await page.getByRole("button", { name: "Vorschlag ansehen" }).click();
  await expect(page.getByText("Zieldatei: README.md")).toBeVisible();
  await expect(page.getByText(/DEMO_TOKEN=TRAINING-ONLY-SECRET/)).toHaveCount(0);
  await page.getByRole("button", { name: "Freigeben" }).click();
  await sendInput(page, "npm test");
  await expect(page.getByText(/2 Tests bestanden/)).toBeVisible();
  await page.getByRole("button", { name: "Ergebnis verifizieren" }).click();
}

test("Dashboard: CLI-Agenten-Kachel bietet Explore, Guided und Challenge an", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "CLI-Agenten kennenlernen" }),
  });
  await expect(card).toContainText("CLI Agent · 3 Modi");
  await expect(card.getByRole("link", { name: /^Explore/ })).toBeVisible();
  await expect(card.getByRole("link", { name: /^Guided/ })).toBeVisible();
  await expect(card.getByRole("link", { name: /^Challenge/ })).toBeVisible();
});

test("Explore: Kontrollflächen erklären Wirkungsbereich, Sicherheit und Verifikation", async ({
  page,
}) => {
  await page.goto(exploreUrl);
  await waitForTrainingReady(page);

  await expect(page.getByRole("heading", { name: "Oberfläche frei untersuchen" })).toBeVisible();
  await expect(page.getByText("Aktivitätsprotokoll", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Plan prüfen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aufgabe stoppen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ergebnis verifizieren" })).toBeVisible();

  await page.locator('[data-highlight="claude.session.header"]').click();
  await expect(page.getByText(/Agentensitzung/)).toBeVisible();

  await page.locator('[data-highlight="claude.diff"]').click();
  await expect(page.getByText(/Änderungsvorschlag/)).toBeVisible();

  await page.locator('[data-highlight="claude.verification"]').click();
  await expect(page.getByText(/Ergebnisverifikation/)).toBeVisible();
});

test("Guided: riskanter Entwurf wird abgelehnt, korrigiert, getestet und verifiziert", async ({
  page,
}) => {
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);

  await page.getByRole("button", { name: "Sitzung starten" }).click();
  await expectGuidedStep(page, 2, "Shellkommando und Agentenauftrag unterscheiden");

  await sendInput(page, "ls");
  await expectGuidedStep(page, 3, "Auftrag mit Ziel und Erfolgskriterium formulieren");

  await sendInput(page, "Ergänze in README.md einen Abschnitt mit den ersten Schritten");
  await expectGuidedStep(page, 4, "Plan vor der Ausführung hinterfragen");
  await expect(page.getByText("config.example als zusätzliche Quelle lesen")).toBeVisible();

  await page.getByRole("button", { name: "Plan prüfen" }).click();
  await expectGuidedStep(page, 5, "Diff und Zieldatei prüfen");

  await page.getByRole("button", { name: "Vorschlag ansehen" }).click();
  await expectGuidedStep(page, 6, "Unnötige Berechtigung ablehnen");
  await expect(page.getByText(/DEMO_TOKEN=TRAINING-ONLY-SECRET/)).toBeVisible();

  await page.getByRole("button", { name: "Ablehnen" }).click();
  await expectGuidedStep(page, 7, "Agenten korrigieren und neu fokussieren");

  await sendInput(page, "Korrigiere den Vorschlag sicher ohne Geheimnisse und schließe config aus");
  await expectGuidedStep(page, 8, "Korrigierten Plan erneut prüfen");
  await expect(page.getByText("config.example ausdrücklich ausschließen")).toBeVisible();

  await page.getByRole("button", { name: "Plan prüfen" }).click();
  await expectGuidedStep(page, 9, "Korrigierten Diff kontrollieren");

  await page.getByRole("button", { name: "Vorschlag ansehen" }).click();
  await expectGuidedStep(page, 10, "Nur die erforderliche Änderung freigeben");
  await expect(page.getByText("Zieldatei: README.md")).toBeVisible();

  await page.getByRole("button", { name: "Freigeben" }).click();
  await expectGuidedStep(page, 11, "Ergebnis mit einem Test prüfen");

  await sendInput(page, "npm test");
  await expectGuidedStep(page, 12, "Abschlusszustand eigenständig verifizieren");
  const verificationPanel = page.getByRole("complementary", {
    name: "Arbeits- und Prüfinformationen",
  });
  await expect(verificationPanel.getByText(/1 Test bestanden/)).toBeVisible();

  await page.getByRole("button", { name: "Ergebnis verifizieren" }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Guided: riskante Freigabe bringt die geforderte Sicherheitsentscheidung nicht voran", async ({
  page,
}) => {
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);

  await page.getByRole("button", { name: "Sitzung starten" }).click();
  await sendInput(page, "ls");
  await sendInput(page, "Ergänze in README.md einen Abschnitt mit den ersten Schritten");
  await page.getByRole("button", { name: "Plan prüfen" }).click();
  await page.getByRole("button", { name: "Vorschlag ansehen" }).click();
  await expectGuidedStep(page, 6, "Unnötige Berechtigung ablehnen");

  await page.getByRole("button", { name: "Freigeben" }).click();
  await expectGuidedStep(page, 6, "Unnötige Berechtigung ablehnen");
  await expect(page.getByText(/DEMO_TOKEN=TRAINING-ONLY-SECRET/)).toHaveCount(0);
});

test("Guided: ein themenfremder Auftrag bringt den Auftragsschritt nicht voran", async ({
  page,
}) => {
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);

  await page.getByRole("button", { name: "Sitzung starten" }).click();
  await sendInput(page, "ls");
  await expectGuidedStep(page, 3, "Auftrag mit Ziel und Erfolgskriterium formulieren");

  await sendInput(page, "Wie spät ist es?");
  await expectGuidedStep(page, 3, "Auftrag mit Ziel und Erfolgskriterium formulieren");
  await expect(page.getByRole("button", { name: "Vorschlag ansehen" })).toHaveCount(0);
});

test("Guided: Sitzungs- und Korrekturzustand übersteht einen Reload", async ({ page }) => {
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);

  await page.getByRole("button", { name: "Sitzung starten" }).click();
  await sendInput(page, "ls");
  await sendInput(page, "Ergänze in README.md einen Abschnitt mit den ersten Schritten");
  await page.getByRole("button", { name: "Plan prüfen" }).click();
  await page.getByRole("button", { name: "Vorschlag ansehen" }).click();
  await page.getByRole("button", { name: "Ablehnen" }).click();
  await expectGuidedStep(page, 7, "Agenten korrigieren und neu fokussieren");

  await page.goto("/");
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);

  await expectGuidedStep(page, 7, "Agenten korrigieren und neu fokussieren");
  await expect(page.getByText("Sitzung aktiv")).toBeVisible();
});

test("Challenge: sicherer Pfad erreicht korrekten getesteten Endzustand", async ({ page }) => {
  await page.goto(challengeUrl);
  await waitForTrainingReady(page);
  await expect(page.getByText(/Sicherheitsgrenze/)).toBeVisible();

  await completeSafeChallenge(page);

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(
    page.getByText(/Bewertet werden Endzustand, Prüfstatus und Sicherheitsentscheidungen/),
  ).toBeVisible();
});

test("Challenge: unzulässige Geheimnisfreigabe kann nicht durch spätere Korrektur geheilt werden", async ({
  page,
}) => {
  await page.goto(challengeUrl);
  await waitForTrainingReady(page);

  await page.getByRole("button", { name: "Vorschlag ansehen" }).click();
  await page.getByRole("button", { name: "Freigeben" }).click();
  await sendInput(page, "Übernimm den Status sicher aus docs/status ohne Geheimnisse");
  await page.getByRole("button", { name: "Vorschlag ansehen" }).click();
  await page.getByRole("button", { name: "Freigeben" }).click();
  await sendInput(page, "npm test");
  await page.getByRole("button", { name: "Ergebnis verifizieren" }).click();

  await expect(page.getByText("Ergebnis noch nicht verifiziert", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toHaveCount(0);
});