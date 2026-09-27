import { expect, test, type Page } from "../fixtures/browser-error-guard";

const guidedUrl = "/training/vscode-basics.guided";
const challengeUrl = "/training/vscode-basics.challenge";

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

test("Windows-Profil: äquivalente Groß-/Kleinschreibung erfüllt den Dateinamen-Schritt", async ({
  page,
}) => {
  await reachCreateFileStep(page);

  // The scenario declares a case-insensitive environment profile, so NOTIZ.txt
  // is the same path as the requested notiz.txt.
  await createFile(page, "NOTIZ.txt");
  await expectGuidedStep(page, 10, "Datei bearbeiten und speichern");

  // The equivalent spelling must not be reported as the wrong training file.
  await expect(page.getByText("Erwartet war notiz.txt", { exact: false })).toHaveCount(0);
});

test("Windows-Profil: Dateiinhalt bleibt exakt und wird nicht mit gefaltet", async ({ page }) => {
  await reachCreateFileStep(page);
  await createFile(page, "NOTIZ.txt");
  await expectGuidedStep(page, 10, "Datei bearbeiten und speichern");

  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  // Same letters, different case: the path folds, the content never does.
  await editor.fill("hello ai training");
  await editor.press("Control+s");
  await expectGuidedStep(page, 10, "Datei bearbeiten und speichern");

  await editor.fill("Hello AI Training");
  await editor.press("Control+s");
  await expectGuidedStep(page, 11, "Bereich und Ansichten unterscheiden");
});

test("Windows-Profil: eine abweichend geschriebene Dublette bleibt dieselbe Datei", async ({
  page,
}) => {
  await reachCreateFileStep(page);
  await createFile(page, "notiz.txt");
  await expectGuidedStep(page, 10, "Datei bearbeiten und speichern");

  const sidebar = page.getByLabel("Primary Side Bar");
  await expect(sidebar.getByRole("button", { name: "notiz.txt", exact: true })).toHaveCount(1);

  await createFile(page, "NOTIZ.TXT");
  await expect(sidebar.getByRole("button", { name: "NOTIZ.TXT", exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: "notiz.txt", exact: true })).toHaveCount(1);
});

test("Case-sensitiver Gegenfall: abweichende Schreibweise erfüllt den Endzustand nicht", async ({
  page,
}) => {
  await page.goto(challengeUrl);
  await waitForTrainingReady(page);
  await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await page.getByRole("button", { name: "ai-training-demo", exact: true }).click();

  // This scenario declares no profile, so the case-sensitive default applies and
  // CHALLENGE.txt stays a different path than the required challenge.txt.
  await createFile(page, "CHALLENGE.txt");
  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.fill("VS Code Grundlagen abgeschlossen");
  await editor.press("Control+s");

  await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toHaveCount(0);

  // The exact spelling completes the very same end state.
  await createFile(page, "challenge.txt");
  await editor.fill("VS Code Grundlagen abgeschlossen");
  await editor.press("Control+s");
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});
