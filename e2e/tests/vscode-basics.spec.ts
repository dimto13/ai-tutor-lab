import { expect, test, type Page } from "@playwright/test";

const guidedUrl = "/training/vscode-basics.guided";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

async function openFileMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "File", exact: true }).click();
}

async function reachCreateFileStep(page: Page): Promise<void> {
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);
  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expectGuidedStep(page, 2, "Einen Ordner als Arbeitskontext öffnen");

  await openFileMenu(page);
  await page.getByRole("button", { name: "Open Folder...", exact: true }).click();
  await expectGuidedStep(page, 3, "Ordner und Workspace unterscheiden");

  await openFileMenu(page);
  await page.getByRole("button", { name: "Open Workspace...", exact: true }).click();
  await expectGuidedStep(page, 4, "Datei erstellen");
}

test("Explore: Oberfläche inspizieren erhöht den Fortschritt und erklärt das Konzept", async ({
  page,
}) => {
  await page.goto("/training/vscode-basics.explore");
  await waitForTrainingReady(page);

  await expect(page.getByRole("heading", { name: "Oberfläche frei untersuchen" })).toBeVisible();
  await expect(page.getByText("0 von 14 Oberflächen untersucht", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Explorer", exact: true }).click();

  await expect(page.getByText("1 von 14 Oberflächen untersucht", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Der Explorer zeigt Dateien und Ordner deines aktuellen Arbeitskontexts und bietet Dateiaktionen wie Neue Datei.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("Guided: Explorer, Folder, Workspace, Editor und Panel laufen als Aktionskette", async ({
  page,
}) => {
  await reachCreateFileStep(page);

  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.py").fill("hello.py");
  await page.getByPlaceholder("dateiname.py").press("Enter");
  await expectGuidedStep(page, 5, "Editor verwenden");

  await page.getByPlaceholder('print("Hello AI Training")').fill('print("Hello AI Training")');
  await expectGuidedStep(page, 6, "Panel und Terminal öffnen");

  await page.getByRole("button", { name: "Terminal", exact: true }).last().click();
  await expectGuidedStep(page, 7, "Problems-View unterscheiden");

  await page.getByRole("button", { name: "Problems", exact: true }).click();
  await expectGuidedStep(page, 8, "Output-View unterscheiden");

  await page.getByRole("button", { name: "Output", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Challenge: freier Klickpfad wird ausschließlich über den Zielzustand bewertet", async ({
  page,
}) => {
  await page.goto("/training/vscode-basics.challenge");
  await waitForTrainingReady(page);
  await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await page.getByRole("button", { name: "ai-training-demo", exact: true }).click();
  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.py").fill("challenge.py");
  await page.getByPlaceholder("dateiname.py").press("Enter");

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(
    page.getByText(
      "Dein Klickweg durfte frei sein. Ein möglicher sauberer Lösungsweg sieht so aus:",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
});

test("Reload: geführter Fortschritt bleibt erhalten", async ({ page }) => {
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);
  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expectGuidedStep(page, 2, "Einen Ordner als Arbeitskontext öffnen");

  await page.reload();
  await waitForTrainingReady(page);

  await expectGuidedStep(page, 2, "Einen Ordner als Arbeitskontext öffnen");
  await expect(page.getByText("Schritt 2 von 8", { exact: true })).toBeVisible();
});

test("Guided: falsches Ergebnis erzeugt Feedback und lässt eine Korrektur zu", async ({ page }) => {
  await reachCreateFileStep(page);

  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.py").fill("wrong.py");
  await page.getByPlaceholder("dateiname.py").press("Enter");

  await expectGuidedStep(page, 4, "Datei erstellen");
  await expect(
    page.getByText("Die Aktion wurde erkannt, erfüllt aber noch nicht das erwartete Ergebnis.", {
      exact: true,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.py").fill("hello.py");
  await page.getByPlaceholder("dateiname.py").press("Enter");
  await expectGuidedStep(page, 5, "Editor verwenden");
});

test("Semantische Targets: Runtime löst Highlights ohne Test-CSS-Selektoren auf", async ({
  page,
}) => {
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);

  await expect(
    page.getByText("Explorer: Dateien und Ordner des aktuellen Arbeitskontexts.", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Explorer", exact: true }).click();

  await expect(
    page.getByText("File enthält Befehle für Dateien, Ordner und Workspaces.", { exact: true }),
  ).toBeVisible();
});
