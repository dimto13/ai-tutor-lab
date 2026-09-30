import { expect, test, type Page } from "../fixtures/browser-error-guard";

const scenarioUrl = "/training/artifact-preview-foundation.guided";
const htmlWorkflowUrl = "/training/html-page-workflow.guided";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

// #478: Reicht die Breite nicht fuer alle offenen Bereiche, darf gestapelt werden, aber kein
// Bereich faellt unter seine Lesbarkeitsgrenze und keiner ueberlagert einen anderen. Der Test
// prueft deshalb die Grenzen und die Anordnung, nicht eine bestimmte Himmelsrichtung.
const EDITOR_MIN_WIDTH = 320;
const PREVIEW_MIN_WIDTH = 280;

type Box = { x: number; y: number; width: number; height: number };

// Eine Pixel Toleranz gegen Subpixel-Rundung der Rendering-Engine.
function overlaps(first: Box, second: Box): boolean {
  return (
    first.x < second.x + second.width - 1 &&
    second.x < first.x + first.width - 1 &&
    first.y < second.y + second.height - 1 &&
    second.y < first.y + first.height - 1
  );
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).boundingBox();
  expect(box, `${selector} muss eine Flaeche haben`).not.toBeNull();
  return box as Box;
}

type WorkspaceLayout = { editor: Box; preview: Box; secondarySideBar: Box };

// Die Assistenzleiste animiert ihre Breite (`transition-all`). Eine einzelne Messung direkt nach
// dem Oeffnen trifft das Layout mitten im Uebergang und liefert Breiten, die es nie wirklich gab.
// Gemessen wird deshalb erst, wenn zwei aufeinanderfolgende Messungen identisch sind.
async function settledLayout(page: Page): Promise<WorkspaceLayout> {
  let previous = "";
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const layout: WorkspaceLayout = {
      editor: await boxOf(page, '[data-highlight="vscode.editor"]'),
      preview: await boxOf(page, '[data-highlight="artifact.preview.panel"]'),
      secondarySideBar: await boxOf(page, '[data-highlight="vscode.secondarySideBar"]'),
    };
    const serialized = JSON.stringify(layout);
    if (serialized === previous) return layout;
    previous = serialized;
    await page.waitForTimeout(100);
  }
  throw new Error(`Das Arbeitsbereich-Layout kommt nicht zur Ruhe: ${previous}`);
}

test("Artefakt-Vorschau: HTML, Tabelle und strukturierte Daten sind sichtbar und aktionsbasiert prüfbar", async ({
  page,
}) => {
  await page.goto(scenarioUrl);
  await waitForTrainingReady(page);

  await expect(page.getByText("Ergebnis · simuliert", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Status-Tabelle/ }).click();
  await expect(page.getByRole("cell", { name: "Nord", exact: true })).toBeVisible();
  await expect(page.getByTitle("COUNTIF(Status;Offen)").first()).toBeVisible();

  await page.getByRole("button", { name: /Strukturiertes Ergebnis/ }).click();
  await expect(page.getByText(/"nextActions": \[/)).toBeVisible();

  await page.getByRole("button", { name: /Team-Übersicht/ }).click();
  await expectGuidedStep(page, 2, "Vorschau und Quelltext unterscheiden");

  const frame = page.getByTitle("Vorschau: Team-Übersicht");
  await expect(frame).toHaveAttribute("sandbox", "");
  await page.evaluate(() => {
    const target = window as typeof window & { artifactScriptExecuted?: boolean };
    target.artifactScriptExecuted = false;
    window.addEventListener("message", (event) => {
      if (event.data === "artifact-script-executed") target.artifactScriptExecuted = true;
    });
  });
  await frame.evaluate((element) => {
    element.setAttribute(
      "srcdoc",
      "<script>parent.postMessage('artifact-script-executed', '*')</script>",
    );
  });
  await page.waitForTimeout(250);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { artifactScriptExecuted?: boolean }).artifactScriptExecuted,
      ),
    )
    .toBe(false);

  await page.getByRole("button", { name: "Quelltext", exact: true }).click();
  await expectGuidedStep(page, 3, "Deterministische Revision anwenden");
  await expect(page.getByText("<h1>Projektstatus</h1>", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: /Freigabestatus ergänzen/ }).click();
  await expectGuidedStep(page, 4, "Ergebnis aktiv verifizieren");
  await expect(page.getByText("Freigabe bereit", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Artefakt-Vorschau: Revision bleibt nach Reload erhalten und Historie verändert keinen Fortschritt", async ({
  page,
}) => {
  await page.goto(scenarioUrl);
  await waitForTrainingReady(page);
  await page.getByRole("button", { name: /Team-Übersicht/ }).click();
  await page.getByRole("button", { name: "Quelltext", exact: true }).click();
  await page.getByRole("button", { name: /Freigabestatus ergänzen/ }).click();
  await expectGuidedStep(page, 4, "Ergebnis aktiv verifizieren");
  await expect(page.getByText("Freigabe bereit", { exact: false })).toBeVisible();

  await page.reload();
  await waitForTrainingReady(page);
  await expectGuidedStep(page, 4, "Ergebnis aktiv verifizieren");
  await expect(page.getByText("Freigabe bereit", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Freigabestatus ergänzen", exact: true }),
  ).toHaveCount(0);

  await page
    .getByRole("button", { name: "Revision Freigabestatus ergänzen ansehen", exact: true })
    .click();
  await expect(page.getByText("Frühere Revision · nur Ansicht", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ergebnis geprüft", exact: true })).toBeDisabled();
  await expectGuidedStep(page, 4, "Ergebnis aktiv verifizieren");

  await page.getByRole("button", { name: "Aktueller Stand", exact: true }).click();
  await expect(page.getByText("Aktueller Stand", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Freigabe bereit", { exact: false })).toBeVisible();
  await expectGuidedStep(page, 4, "Ergebnis aktiv verifizieren");

  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

// Getrennte Testfaelle statt zwei Viewports in einem Lauf: sonst verdeckt ein Fehlschlag bei
// 1280px das Ergebnis fuer 1440px.
for (const width of [1280, 1440]) {
  test(`HTML-Workflow: Editor bleibt mit Ergebnis und Copilot bei ${width}px lesbar`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(htmlWorkflowUrl);
    await waitForTrainingReady(page);

    await expect(page.locator('[data-highlight="vscode.editor"]')).toBeVisible();
    await expect(page.locator('[data-highlight="artifact.preview.panel"]')).toBeVisible();
    await page.getByRole("button", { name: "Copilot", exact: true }).click();
    await expect(page.locator('[data-highlight="copilot.chat"]')).toBeVisible();

    const { editor, preview, secondarySideBar } = await settledLayout(page);

    // Die gemessene Geometrie steht in jeder Fehlermeldung: ein Layout-Fehlschlag ohne Zahlen
    // kostet sonst einen weiteren CI-Lauf, nur um zu sehen, was eigentlich wie breit war.
    const layout = JSON.stringify({ editor, preview, secondarySideBar });

    // Keine Arbeitsflaeche faellt unter ihre Lesbarkeitsgrenze; stapeln darf das Layout dafuer.
    expect(editor.width, `Editor zu schmal: ${layout}`).toBeGreaterThanOrEqual(EDITOR_MIN_WIDTH);
    expect(preview.width, `Ergebnisflaeche zu schmal: ${layout}`).toBeGreaterThanOrEqual(
      PREVIEW_MIN_WIDTH,
    );

    expect(
      overlaps(editor, preview),
      `Editor und Ergebnisflaeche ueberlagern sich: ${layout}`,
    ).toBe(false);
    expect(
      overlaps(editor, secondarySideBar),
      `Editor und Assistenz ueberlagern sich: ${layout}`,
    ).toBe(false);
    expect(
      overlaps(preview, secondarySideBar),
      `Ergebnisflaeche und Assistenz ueberlagern sich: ${layout}`,
    ).toBe(false);

    // Die Assistenzleiste bleibt rechts von beiden Arbeitsflaechen.
    expect(editor.x + editor.width).toBeLessThanOrEqual(secondarySideBar.x + 1);
    expect(preview.x + preview.width).toBeLessThanOrEqual(secondarySideBar.x + 1);

    // Genau eine der beiden zulaessigen Anordnungen, nichts dazwischen.
    const sideBySide = editor.x + editor.width <= preview.x + 1;
    const stacked = preview.y >= editor.y + editor.height - 1;
    expect(sideBySide || stacked, "Ergebnisflaeche liegt weder rechts noch unter dem Editor").toBe(
      true,
    );
  });
}
