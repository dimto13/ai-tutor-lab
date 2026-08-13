import { expect, test, type Locator, type Page } from "@playwright/test";

const guidedUrl = "/training/vscode-basics.guided";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

async function skipGuidedIntroductions(page: Page): Promise<void> {
  await expectGuidedStep(page, 1, "Activity Bar einordnen");
  await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
  await expectGuidedStep(page, 7, "Explorer öffnen");
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
  await skipGuidedIntroductions(page);

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expectGuidedStep(page, 8, "Einen Ordner als Arbeitskontext öffnen");

  await openFileMenu(page);
  await page.getByRole("menuitem", { name: /Open Folder\.\.\./ }).click();
  await expectGuidedStep(page, 9, "Datei erstellen");
}

async function completeChallengeFile(page: Page): Promise<void> {
  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.fill("VS Code Grundlagen abgeschlossen");
  await expect(
    page.getByRole("status", { name: "challenge.txt: ungespeicherte Änderungen" }),
  ).toBeVisible();
  await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();
  await editor.press("Control+s");
}

test("Explore: Oberfläche inspizieren erhöht den Fortschritt und erklärt das Konzept", async ({
  page,
}) => {
  await page.goto("/training/vscode-basics.explore");
  await waitForTrainingReady(page);

  await expect(page.getByRole("heading", { name: "Oberfläche frei untersuchen" })).toBeVisible();
  await expect(page.getByText("0 von 23 Oberflächen untersucht", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Explorer", exact: true }).click();

  await expect(page.getByText("1 von 23 Oberflächen untersucht", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Der Explorer zeigt Dateien und Ordner deines aktuellen Arbeitskontexts\./),
  ).toBeVisible();
  await expect(
    page.getByText(/Windows-Datei-Explorer oder der Dialog Öffnen in Office/),
  ).toBeVisible();
});

test("Explore: alle Hauptmenüs öffnen vollständig und werden als Lernoberflächen erkannt", async ({
  page,
}) => {
  await page.goto("/training/vscode-basics.explore");
  await waitForTrainingReady(page);

  const menus = [
    ["vscode.menu.file", "File", /New Text File/],
    ["vscode.menu.edit", "Edit", /Undo/],
    ["vscode.menu.selection", "Selection", /Select All/],
    ["vscode.menu.view", "View", /Command Palette/],
    ["vscode.menu.go", "Go", /Back/],
    ["vscode.menu.run", "Run", /Start Debugging/],
    ["vscode.menu.terminal", "Terminal", /New Terminal/],
    ["vscode.menu.help", "Help", /Welcome/],
  ] as const;

  for (const [target, label, expectedItem] of menus) {
    await page.locator(`[data-highlight="${target}"]`).click();
    const menu = page.getByRole("menu", { name: `${label} menu` });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: expectedItem }).first()).toBeVisible();
  }

  await expect(page.getByText("8 von 23 Oberflächen untersucht", { exact: true })).toBeVisible();
  await expect(page.getByText(/Hilfe- und Informationszentrale/)).toBeVisible();
});

test("Menüs: Untermenüs und simulierte Aktionen funktionieren", async ({ page }) => {
  await page.goto("/training/vscode-basics.explore");
  await waitForTrainingReady(page);

  await page.locator('[data-highlight="vscode.menu.view"]').click();
  await page.getByRole("menuitem", { name: "Appearance", exact: true }).click();
  await expect(page.getByRole("menu", { name: "Appearance submenu" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Full Screen", exact: true })).toBeVisible();

  await page.getByRole("menuitem", { name: "Problems", exact: true }).click();
  await expect(page.getByText("No problems have been detected in the workspace.")).toBeVisible();

  await page.locator('[data-highlight="vscode.menu.terminal"]').click();
  await page
    .getByRole("menuitem", { name: /New Terminal/ })
    .first()
    .click();
  await expect(page.getByRole("textbox", { name: "Terminal-Eingabe" })).toBeVisible();
});

test("Guided: Grundbegriffe sind vor der ersten Aufgabe optional vorgeschaltet", async ({
  page,
}) => {
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);

  await expectGuidedStep(page, 1, "Activity Bar einordnen");
  await expect(page.getByText(/Navigationsleiste in Outlook/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Grundbegriff verstanden" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Grundbegriffe überspringen" })).toBeVisible();

  await skipGuidedIntroductions(page);
  await expect(page.locator("header").getByText("Schritt 7 von 13", { exact: true })).toBeVisible();
});

test("Guided: Explorer, Folder, Editor, Speichern und Panel laufen als Anfängerpfad", async ({
  page,
}) => {
  await reachCreateFileStep(page);

  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.ext").fill("notiz.txt");
  await page.getByPlaceholder("dateiname.ext").press("Enter");
  await expectGuidedStep(page, 10, "Datei bearbeiten und speichern");

  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.fill("Hello AI Training");
  await expect(
    page.getByRole("status", { name: "notiz.txt: ungespeicherte Änderungen" }),
  ).toBeVisible();
  await expectGuidedStep(page, 10, "Datei bearbeiten und speichern");

  await editor.press("Control+s");
  await expect(
    page.getByRole("status", { name: "notiz.txt: ungespeicherte Änderungen" }),
  ).toHaveCount(0);
  await expectGuidedStep(page, 11, "Panel und seine Views unterscheiden");

  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  await page
    .getByRole("menuitem", { name: /New Terminal/ })
    .first()
    .click();
  await expectGuidedStep(page, 12, "Problems-View verwenden");

  await page.getByRole("button", { name: "Problems", exact: true }).click();
  await expectGuidedStep(page, 13, "Output-View verwenden");

  await page.getByRole("button", { name: "Output", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Guided: schmaler Viewport hält Kopfzeile, Menüs, Editor und Highlight vollständig sichtbar", async ({
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

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await openFileMenu(page);
  const openFolderItem = page.getByRole("menuitem", { name: /Open Folder\.\.\./ });
  await expect(openFolderItem).toBeVisible();
  const openFolderBox = await openFolderItem.boundingBox();
  expect(openFolderBox).not.toBeNull();
  expect(openFolderBox!.x).toBeGreaterThanOrEqual(0);
  expect(openFolderBox!.x + openFolderBox!.width).toBeLessThanOrEqual(323);
  expect(openFolderBox!.y).toBeGreaterThanOrEqual(0);
  await openFileMenu(page);

  await page.getByRole("button", { name: "Guide anzeigen" }).click();
  await expectGuidedStep(page, 1, "Activity Bar einordnen");
  await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
  await expectGuidedStep(page, 7, "Explorer öffnen");
  await expect(page.getByRole("button", { name: "Arbeitsbereich anzeigen" })).toBeVisible();
  await expect(page.getByTestId("highlight-frame")).toHaveCount(0);

  await page.getByRole("button", { name: "Arbeitsbereich anzeigen" }).click();
  const spotlight = page.getByTestId("highlight-frame");
  await expectSpotlightAround(
    spotlight,
    page.getByRole("button", { name: "Explorer", exact: true }),
  );

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole("button", { name: "Explorer", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Arbeitsbereich anzeigen" })).toBeHidden();
  await expect(page.getByTestId("highlight-frame")).toBeVisible();
});

test("Challenge: freier Klickpfad wird ausschließlich über den gespeicherten Zielzustand bewertet", async ({
  page,
}) => {
  await page.goto("/training/vscode-basics.challenge");
  await waitForTrainingReady(page);
  await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await page.getByRole("button", { name: "ai-training-demo", exact: true }).click();
  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.ext").fill("challenge.txt");
  await page.getByPlaceholder("dateiname.ext").press("Enter");
  await completeChallengeFile(page);

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

test("Challenge: alternativer Workspace-Pfad erfüllt denselben gespeicherten Endzustand", async ({
  page,
}) => {
  await page.goto("/training/vscode-basics.challenge");
  await waitForTrainingReady(page);

  await openFileMenu(page);
  await page.getByRole("menuitem", { name: /Open Workspace from File\.\.\./ }).click();
  await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.ext").fill("challenge.txt");
  await page.getByPlaceholder("dateiname.ext").press("Enter");
  await completeChallengeFile(page);

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(
    page.getByText(
      "Der konkrete Klickweg darf abweichen; bewertet wird der vollständige gespeicherte Endzustand.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("Reload: geführter Fortschritt und übersprungene Grundbegriffe bleiben erhalten", async ({
  page,
}) => {
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);
  await skipGuidedIntroductions(page);
  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expectGuidedStep(page, 8, "Einen Ordner als Arbeitskontext öffnen");

  await page.reload();
  await waitForTrainingReady(page);

  await expectGuidedStep(page, 8, "Einen Ordner als Arbeitskontext öffnen");
  await expect(page.locator("header").getByText("Schritt 8 von 13", { exact: true })).toBeVisible();
});

test("Guided: falsches Ergebnis erzeugt Feedback und lässt eine Korrektur zu", async ({ page }) => {
  await reachCreateFileStep(page);

  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.ext").fill("wrong.py");
  await page.getByPlaceholder("dateiname.ext").press("Enter");

  await expectGuidedStep(page, 9, "Datei erstellen");
  await expect(
    page
      .getByTestId("guided-orientation")
      .getByText("Fast richtig. Für diese Übung brauchen wir genau den Dateinamen notiz.txt.", {
        exact: true,
      }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.ext").fill("notiz.txt");
  await page.getByPlaceholder("dateiname.ext").press("Enter");
  await expectGuidedStep(page, 10, "Datei bearbeiten und speichern");
});

test("Semantische Targets: Runtime löst Highlights ohne Test-CSS-Selektoren auf", async ({
  page,
}) => {
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);
  await skipGuidedIntroductions(page);

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

  await page.getByRole("button", { name: "Guide anzeigen" }).click();
  await expectGuidedStep(page, 1, "Activity Bar einordnen");
  await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
  await expectGuidedStep(page, 7, "Explorer öffnen");
  await page.getByRole("button", { name: "Arbeitsbereich anzeigen" }).click();

  const spotlight = page.getByTestId("highlight-frame");
  const explorer = page.getByRole("button", { name: "Explorer", exact: true });
  await expectSpotlightAround(spotlight, explorer);

  await explorer.click();
  await expectSpotlightAround(spotlight, page.getByRole("button", { name: "File", exact: true }));
});
