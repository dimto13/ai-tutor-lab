import { expect, test, type Page } from "../fixtures/browser-error-guard";

const guidedUrl = "/training/vscode-basics.guided";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

async function reachCreateFileStep(page: Page): Promise<void> {
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);
  await expectGuidedStep(page, 1, "Activity Bar einordnen");
  await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
  await expectGuidedStep(page, 7, "Explorer öffnen");

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expectGuidedStep(page, 8, "Einen Ordner als Arbeitskontext öffnen");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /Open Folder\.\.\./ }).click();
  await expectGuidedStep(page, 9, "Datei erstellen");
}

async function createFile(page: Page, filename: string): Promise<void> {
  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.ext").fill(filename);
  await page.getByPlaceholder("dateiname.ext").press("Enter");
}

async function finishGuidedScenarioFromEditor(page: Page): Promise<void> {
  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.fill("Hello AI Training");
  await editor.press("Control+s");
  await expectGuidedStep(page, 11, "Bereich und Ansichten unterscheiden");

  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  await page
    .getByRole("menuitem", { name: /New Terminal/ })
    .first()
    .click();
  await expectGuidedStep(page, 12, "Probleme-Ansicht verwenden");

  await page.getByRole("button", { name: "Problems", exact: true }).click();
  await expectGuidedStep(page, 13, "Ausgabe-Ansicht verwenden");
  await page.getByRole("button", { name: "Output", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
}

test("Guided-Recovery: falsche Datei bleibt nach Reload recoverbar und Training kann abschließen", async ({
  page,
}) => {
  await reachCreateFileStep(page);

  await createFile(page, "wrong.py");
  await expectGuidedStep(page, 9, "Datei erstellen");
  await expect(page.getByTestId("guided-recovery")).toContainText(
    "Fehlversuch bleibt dokumentiert",
  );

  await page.reload();
  await waitForTrainingReady(page);
  await expectGuidedStep(page, 9, "Datei erstellen");
  const recovery = page.getByTestId("guided-recovery");
  await expect(recovery).toContainText("Fehlversuch bleibt dokumentiert");
  await expect(recovery.getByRole("button", { name: "Schritt wiederherstellen" })).toBeVisible();

  await recovery.getByRole("button", { name: "Schritt wiederherstellen" }).click();
  await expectGuidedStep(page, 9, "Datei erstellen");
  await expect(page.getByRole("button", { name: "wrong.py", exact: true })).toHaveCount(0);

  await createFile(page, "notiz.txt");
  await expectGuidedStep(page, 10, "Datei bearbeiten und speichern");
  await finishGuidedScenarioFromEditor(page);
});

test("Guided-Recovery: geschlossener Editor wird repariert und bleibt nach Reload korrekt", async ({
  page,
}) => {
  await reachCreateFileStep(page);
  await createFile(page, "notiz.txt");
  await expectGuidedStep(page, 10, "Datei bearbeiten und speichern");

  await page.getByRole("button", { name: "notiz.txt schließen" }).click();
  const recovery = page.getByTestId("guided-recovery");
  await expect(recovery).toContainText("notiz.txt ist nicht mehr im Editor aktiv");
  await recovery.getByRole("button", { name: "Korrigieren" }).click();

  await expectGuidedStep(page, 10, "Datei bearbeiten und speichern");
  await expect(page.getByRole("textbox", { name: "Editor-Inhalt" })).toBeVisible();
  await expect(page.getByTestId("guided-recovery")).toHaveCount(0);

  await page.reload();
  await waitForTrainingReady(page);
  await expectGuidedStep(page, 10, "Datei bearbeiten und speichern");
  await expect(page.getByRole("textbox", { name: "Editor-Inhalt" })).toBeVisible();
  await expect(page.getByTestId("guided-recovery")).toHaveCount(0);

  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.fill("Hello AI Training");
  await editor.press("Control+s");
  await expectGuidedStep(page, 11, "Bereich und Ansichten unterscheiden");
});
