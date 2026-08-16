import { expect, test, type Page } from "../fixtures/browser-error-guard";

const guidedUrl = "/training/claude-code-basics.guided";

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

test("Dashboard: CLI-Agenten-Kachel bietet den Guided-Modus an", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "CLI-Agenten kennenlernen" }),
  });
  await expect(card.getByRole("link", { name: /^Guided/ })).toBeVisible();
});

test("Guided: Sitzung, Auftrag, Prüfung und Freigabe entstehen durch echte Aktionen", async ({
  page,
}) => {
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);

  await page.getByRole("button", { name: "Sitzung starten" }).click();
  await expectGuidedStep(page, 2, "Dateien im Arbeitsverzeichnis ansehen");

  await sendInput(page, "ls");
  await expectGuidedStep(page, 3, "Ziel in eigenen Worten formulieren");

  await sendInput(page, "Ergänze in der README einen Abschnitt mit den ersten Schritten");
  await expectGuidedStep(page, 4, "Vorschlag ansehen, bevor er wirkt");
  await expect(page.getByText("README.md im Arbeitsverzeichnis lesen")).toBeVisible();

  await page.getByRole("button", { name: "Vorschlag ansehen" }).click();
  await expectGuidedStep(page, 5, "Änderung bewusst freigeben");
  await expect(page.getByText("Zieldatei: README.md")).toBeVisible();

  await page.getByRole("button", { name: "Freigeben" }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Guided: ein themenfremder Auftrag bringt den Schritt nicht voran", async ({ page }) => {
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);

  await page.getByRole("button", { name: "Sitzung starten" }).click();
  await sendInput(page, "ls");
  await expectGuidedStep(page, 3, "Ziel in eigenen Worten formulieren");

  await sendInput(page, "Wie spät ist es?");
  await expectGuidedStep(page, 3, "Ziel in eigenen Worten formulieren");
  await expect(page.getByRole("button", { name: "Vorschlag ansehen" })).toHaveCount(0);
});

test("Guided: Sitzungszustand übersteht einen Reload", async ({ page }) => {
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);

  await page.getByRole("button", { name: "Sitzung starten" }).click();
  await sendInput(page, "ls");
  await expectGuidedStep(page, 3, "Ziel in eigenen Worten formulieren");

  await page.goto("/");
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);

  await expectGuidedStep(page, 3, "Ziel in eigenen Worten formulieren");
  await expect(page.getByText("Sitzung aktiv")).toBeVisible();
});
