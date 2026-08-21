import { expect, test, type Locator, type Page } from "../fixtures/browser-error-guard";

const guidedUrl = "/training/vscode-basics.guided";
const storageKey =
  "ai-training-lab:tenant:value:local-tenant:user:local-learner:vscode-basics.guided:mode:guided:state:v4";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

async function reachCreateFileStep(page: Page): Promise<void> {
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);
  await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /Open Folder\.\.\./ }).click();
  await expectGuidedStep(page, 9, "Datei erstellen");
}

async function createFile(page: Page, filename: string): Promise<void> {
  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.ext").fill(filename);
  await page.getByPlaceholder("dateiname.ext").press("Enter");
}

async function expectSpotlightAround(spotlight: Locator, target: Locator): Promise<void> {
  await expect(spotlight).toBeVisible();
  await expect
    .poll(async () => {
      const [spotlightBox, targetBox] = await Promise.all([
        spotlight.boundingBox(),
        target.boundingBox(),
      ]);
      if (!spotlightBox || !targetBox) return null;
      return {
        x: Math.round(spotlightBox.x - Math.max(2, targetBox.x - 6)),
        y: Math.round(spotlightBox.y - Math.max(2, targetBox.y - 6)),
      };
    })
    .toEqual({ x: 0, y: 0 });
}

test("Guided: primäre nächste Lernaktion bleibt ohne Panel-Scroll sichtbar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);
  await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();

  const orientation = page.getByTestId("guided-orientation");
  await expect(orientation).toBeVisible();
  await expect(
    orientation.getByText("Dein nächster Schritt · 7 von 13", { exact: true }),
  ).toBeVisible();
  await expectGuidedStep(page, 7, "Explorer öffnen");

  const primary = page.locator('[data-primary-learning-action="true"]');
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveAttribute("data-primary-action-kind", "runtime");
  await expect(primary).toHaveAttribute("data-primary-target", "vscode.activityBar.explorer");
  await expect(primary).toContainText("Öffne den Explorer");
  await expect(page.locator('[data-primary-action-kind="platform"]')).toHaveCount(0);

  const box = await orientation.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(720);

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expectGuidedStep(page, 8, "Einen Ordner als Arbeitskontext öffnen");
  await expect(primary).toHaveAttribute("data-primary-target", "vscode.menu.file");
});

test("Guided: irrelevante Events bleiben still und onFailure markiert das konfigurierte Ziel", async ({
  page,
}) => {
  await reachCreateFileStep(page);

  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  await page
    .getByRole("menuitem", { name: /New Terminal/ })
    .first()
    .click();
  await expectGuidedStep(page, 9, "Datei erstellen");
  await expect(page.getByText("Noch keine Aktion geprüft.", { exact: true })).toBeVisible();

  await createFile(page, "wrong.py");
  await expect(
    page
      .getByTestId("guided-orientation")
      .getByText("Fast richtig. Für diese Übung brauchen wir genau den Dateinamen notiz.txt.", {
        exact: true,
      }),
  ).toBeVisible();
  await expectSpotlightAround(
    page.getByTestId("highlight-frame"),
    page.locator('[data-highlight="vscode.explorer.tree"]'),
  );
});

test("Guided: nach drei Fehlversuchen wird Hilfe aktiv angeboten und je Schritt persistiert", async ({
  page,
}) => {
  await reachCreateFileStep(page);
  await expect(
    page.getByText(
      /Vor Abruf: Für Hilfe 1 ist ein Abzug von 10 % auf den Schrittbonus vorgesehen\./,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Bei einer serverseitigen Wertung wird dieser Abzug beim Abschluss berücksichtigt\./,
    ),
  ).toBeVisible();

  for (const filename of ["wrong-1.py", "wrong-2.py", "wrong-3.py"]) {
    await createFile(page, filename);
    await expectGuidedStep(page, 9, "Datei erstellen");
  }

  await expect(page.getByRole("button", { name: "Hilfe 1 jetzt anzeigen" })).toBeVisible();
  await page.getByRole("button", { name: "Hilfe 1 jetzt anzeigen" }).click();
  await expect(page.getByText("Hilfe 1", { exact: true })).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate((key) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const envelope = JSON.parse(raw) as {
          value?: {
            hintsUsed?: number;
            hintUsage?: Array<{ stepId: string; level: number }>;
          };
        };
        const lastUsage = envelope.value?.hintUsage?.at(-1);
        return {
          hintsUsed: envelope.value?.hintsUsed,
          usage: lastUsage
            ? {
                stepId: lastUsage.stepId,
                level: lastUsage.level,
              }
            : undefined,
        };
      }, storageKey),
    )
    .toEqual({ hintsUsed: 1, usage: { stepId: "create_file", level: 1 } });

  await page.reload();
  await waitForTrainingReady(page);
  await expectGuidedStep(page, 9, "Datei erstellen");
  await expect(page.getByRole("button", { name: "Hilfe 2 anzeigen" })).toBeVisible();
  await expect(
    page.getByText(
      /Vor Abruf: Für Hilfe 2 ist ein Abzug von 25 % auf den Schrittbonus vorgesehen\./,
    ),
  ).toBeVisible();
});

test("Guided: Fehlversuche werden gezählt, lokale E2E-Wertung bleibt nicht autoritativ", async ({
  page,
}) => {
  await reachCreateFileStep(page);
  await createFile(page, "wrong.py");
  await createFile(page, "notiz.txt");

  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.fill("Hello AI Training");
  await editor.press("Control+s");
  await expectGuidedStep(page, 11, "Bereich und Ansichten unterscheiden");

  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  await page
    .getByRole("menuitem", { name: /New Terminal/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Problems", exact: true }).click();
  await page.getByRole("button", { name: "Output", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  const pointsMetric = page.getByText("Punkte", { exact: true }).locator("..");
  const mistakesMetric = page.getByText("Fehlversuche", { exact: true }).locator("..");
  await expect(pointsMetric.getByText("—", { exact: true })).toBeVisible();
  await expect(mistakesMetric.getByText("1", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Im lokalen Trainingsmodus werden bewusst keine autoritativen Punkte vergeben/),
  ).toBeVisible();
});
