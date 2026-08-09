import { expect, test, type Locator, type Page } from "@playwright/test";

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

async function expectSpotlightAround(spotlight: Locator, target: Locator): Promise<void> {
  await expect(spotlight).toBeVisible();
  await expect
    .poll(async () => {
      const [spotlightBox, targetBox, viewport] = await Promise.all([
        spotlight.boundingBox(),
        target.boundingBox(),
        target.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
      ]);
      if (!spotlightBox || !targetBox) return null;

      const padding = 6;
      const viewportInset = 2;
      const expectedLeft = Math.max(viewportInset, targetBox.x - padding);
      const expectedTop = Math.max(viewportInset, targetBox.y - padding);
      const expectedRight = Math.min(
        viewport.width - viewportInset,
        targetBox.x + targetBox.width + padding,
      );
      const expectedBottom = Math.min(
        viewport.height - viewportInset,
        targetBox.y + targetBox.height + padding,
      );

      return {
        top: Math.round(spotlightBox.y - expectedTop),
        right: Math.round(spotlightBox.x + spotlightBox.width - expectedRight),
        bottom: Math.round(spotlightBox.y + spotlightBox.height - expectedBottom),
        left: Math.round(spotlightBox.x - expectedLeft),
      };
    })
    .toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
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

test("Guided: schmaler Viewport hält Kopfzeile, Explorer, Editor und Highlight vollständig sichtbar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 323, height: 646 });
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);

  await expect(page.getByRole("button", { name: "Guide anzeigen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Explorer", exact: true })).toBeVisible();

  const editorBox = await page.locator('[data-highlight="vscode.editor"]').boundingBox();
  expect(editorBox).not.toBeNull();
  expect(editorBox!.x).toBeGreaterThanOrEqual(0);
  expect(editorBox!.width).toBeGreaterThan(100);
  expect(editorBox!.x + editorBox!.width).toBeLessThanOrEqual(323);

  const highlightBox = await page.getByTestId("highlight-frame").boundingBox();
  expect(highlightBox).not.toBeNull();
  expect(highlightBox!.x).toBeGreaterThanOrEqual(0);
  expect(highlightBox!.x + highlightBox!.width).toBeLessThanOrEqual(323);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await openFileMenu(page);
  const openFolderItem = page.getByRole("button", { name: "Open Folder...", exact: true });
  await expect(openFolderItem).toBeVisible();
  const openFolderBox = await openFolderItem.boundingBox();
  expect(openFolderBox).not.toBeNull();
  expect(openFolderBox!.y).toBeGreaterThanOrEqual(0);
  await openFileMenu(page);

  await page.getByRole("button", { name: "Guide anzeigen" }).click();
  await expectGuidedStep(page, 1, "Explorer kennenlernen");
  await expect(page.getByRole("button", { name: "Arbeitsbereich anzeigen" })).toBeVisible();
  await expect(page.getByTestId("highlight-frame")).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole("button", { name: "Explorer", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Arbeitsbereich anzeigen" })).toBeHidden();
  await expect(page.getByTestId("highlight-frame")).toBeVisible();
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

test("Challenge: alternativer Workspace-Pfad erfüllt denselben Endzustand", async ({ page }) => {
  await page.goto("/training/vscode-basics.challenge");
  await waitForTrainingReady(page);

  await openFileMenu(page);
  await page.getByRole("button", { name: "Open Workspace...", exact: true }).click();
  await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.py").fill("challenge.py");
  await page.getByPlaceholder("dateiname.py").press("Enter");

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(
    page.getByText(
      "Der konkrete Klickweg darf abweichen; bewertet wird nur, ob Arbeitskontext und Zieldatei vorhanden sind.",
      { exact: true },
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

test("Guided: Highlight-Rahmen folgt dem geklemmten Geometrievertrag", async ({ page }) => {
  await page.setViewportSize({ width: 323, height: 646 });
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);

  const spotlight = page.getByTestId("highlight-frame");
  const explorer = page.getByRole("button", { name: "Explorer", exact: true });
  await expectSpotlightAround(spotlight, explorer);

  await explorer.click();
  await expectGuidedStep(page, 2, "Einen Ordner als Arbeitskontext öffnen");
  await expectSpotlightAround(spotlight, page.getByRole("button", { name: "File", exact: true }));
});
