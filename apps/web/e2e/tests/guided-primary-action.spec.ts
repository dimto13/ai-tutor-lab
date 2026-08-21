import { expect, test, type Page } from "../fixtures/browser-error-guard";

const guidedUrl = "/training/vscode-basics.guided";

async function ready(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectStep(page: Page, number: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${number} – ${title}` })).toBeVisible();
}

async function expectOnePrimary(page: Page, kind: "platform" | "runtime", target?: string) {
  const primary = page.locator('[data-primary-learning-action="true"]');
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveAttribute("data-primary-action-kind", kind);
  if (target !== undefined) await expect(primary).toHaveAttribute("data-primary-target", target);
  return primary;
}

async function skipIntroductions(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
  await expectStep(page, 7, "Explorer öffnen");
}

test("Guided startet mit geschlossenem Tutor; Öffnen und Schließen verändert keinen Fortschritt", async ({
  page,
}) => {
  await page.goto(guidedUrl);
  await ready(page);
  await expectStep(page, 1, "Activity Bar einordnen");

  await expect(page.getByTestId("tutor-chat-collapsed")).toBeVisible();
  await expect(page.getByTestId("tutor-chat-expanded")).toHaveCount(0);
  const activeStep = page.locator('[aria-current="step"]');
  const activeTestId = await activeStep.getAttribute("data-testid");

  await page.getByTestId("tutor-chat-toggle").click();
  await expect(page.getByTestId("tutor-chat-expanded")).toBeVisible();
  await expectStep(page, 1, "Activity Bar einordnen");
  expect(await page.locator('[aria-current="step"]').getAttribute("data-testid")).toBe(
    activeTestId,
  );

  await page.getByRole("button", { name: "Tutor schließen" }).click();
  await expect(page.getByTestId("tutor-chat-collapsed")).toBeVisible();
  await expectStep(page, 1, "Activity Bar einordnen");
  expect(await page.locator('[aria-current="step"]').getAttribute("data-testid")).toBe(
    activeTestId,
  );
});

test("Guided kennzeichnet pro Schritt genau eine primäre Lernaktion und bleibt ohne freien Tutor abschließbar", async ({
  page,
}) => {
  await page.goto(guidedUrl);
  await ready(page);

  for (let stepNumber = 1; stepNumber <= 6; stepNumber += 1) {
    const primary = await expectOnePrimary(page, "platform");
    await expect(primary).toHaveAccessibleName("Grundbegriff verstanden");
    await expect(primary).toBeInViewport();
    await primary.click();
  }

  await expectStep(page, 7, "Explorer öffnen");
  let primary = await expectOnePrimary(page, "runtime", "vscode.activityBar.explorer");
  await expect(primary).toHaveAccessibleName("Primäre nächste Lernaktion im simulierten Werkzeug");
  await expect(primary).toContainText("Öffne den Explorer");
  await expect(page.locator('[data-primary-action-kind="platform"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expectStep(page, 8, "Einen Ordner als Arbeitskontext öffnen");
  await expectOnePrimary(page, "runtime", "vscode.menu.file");

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /Open Folder\.\.\./ }).click();
  await expectStep(page, 9, "Datei erstellen");
  await expectOnePrimary(page, "runtime", "vscode.explorer.newFile");

  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.ext").fill("notiz.txt");
  await page.getByPlaceholder("dateiname.ext").press("Enter");
  await expectStep(page, 10, "Datei bearbeiten und speichern");
  await expectOnePrimary(page, "runtime", "vscode.editor");

  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.fill("Hello AI Training");
  await editor.press("Control+s");
  await expectStep(page, 11, "Bereich und Ansichten unterscheiden");
  await expectOnePrimary(page, "runtime", "vscode.menu.terminal");

  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  await page
    .getByRole("menuitem", { name: /New Terminal/ })
    .first()
    .click();
  await expectStep(page, 12, "Probleme-Ansicht verwenden");
  await expectOnePrimary(page, "runtime", "vscode.panel.problems");

  await page.getByRole("button", { name: "Problems", exact: true }).click();
  await expectStep(page, 13, "Ausgabe-Ansicht verwenden");
  primary = await expectOnePrimary(page, "runtime", "vscode.panel.output");
  await expect(primary).toBeVisible();

  await expect(page.getByTestId("tutor-chat-collapsed")).toBeVisible();
  await expect(page.getByTestId("tutor-chat-expanded")).toHaveCount(0);
  await page.getByRole("button", { name: "Output", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("bestehende Hilfe-Eskalation hebt den Tutor-Einstieg hervor, ohne ihn automatisch zu öffnen", async ({
  page,
}) => {
  await page.goto(guidedUrl);
  await ready(page);
  await skipIntroductions(page);

  const collapsedTutor = page.getByTestId("tutor-chat-collapsed");
  await expect(collapsedTutor).toHaveAttribute("data-tutor-prominent", "false");
  await page.getByRole("button", { name: "Hilfe 1 anzeigen" }).click();
  await expect(collapsedTutor).toHaveAttribute("data-tutor-prominent", "true");
  await expect(collapsedTutor).toContainText("Zusätzliche Hilfe ist für diesen Schritt verfügbar.");
  const tutorToggle = page.getByTestId("tutor-chat-toggle");
  await expect(tutorToggle).toHaveAccessibleName("Tutor fragen");
  await expect(tutorToggle).toHaveAttribute("aria-describedby", "tutor-chat-help-hint");
  await expect(page.locator("#tutor-chat-help-hint")).toHaveText(
    "Zusätzliche Hilfe ist für diesen Schritt verfügbar.",
  );
  await expect(page.getByTestId("tutor-chat-expanded")).toHaveCount(0);
});

test("Recovery wird zur einzigen sichtbaren Primäraktion und gibt danach den Schrittauftrag wieder frei", async ({
  page,
}) => {
  await page.goto(guidedUrl);
  await ready(page);
  await skipIntroductions(page);

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /Open Folder\.\.\./ }).click();
  await expectStep(page, 9, "Datei erstellen");

  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.ext").fill("wrong.py");
  await page.getByPlaceholder("dateiname.ext").press("Enter");

  const recovery = page.getByTestId("guided-recovery");
  await expect(recovery).toBeVisible();
  const visiblePrimary = page.locator('[data-primary-learning-action="true"]:visible');
  await expect(visiblePrimary).toHaveCount(1);
  await expect(visiblePrimary).toHaveAttribute("data-primary-action-kind", "platform");
  await expect(visiblePrimary).toHaveAttribute("data-testid", "guided-recovery-primary-action");
  await expect(visiblePrimary).toHaveAccessibleName("Schritt wiederherstellen");
  await expect(page.getByTestId("guided-primary-action")).toBeHidden();
  await expect(page.getByTestId("tutor-chat-collapsed")).toHaveAttribute(
    "data-tutor-prominent",
    "true",
  );

  await visiblePrimary.click();
  await expect(page.getByTestId("guided-recovery")).toHaveCount(0);
  await expectOnePrimary(page, "runtime", "vscode.explorer.newFile");
});

test("kleiner Viewport hält Primäraktion und Tutor-Einstieg ohne horizontales Überlaufen erreichbar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 323, height: 646 });
  await page.goto(guidedUrl);
  await ready(page);

  await page.getByRole("button", { name: "Guide anzeigen" }).click();
  const primary = await expectOnePrimary(page, "platform");
  await expect(primary).toBeInViewport();
  await expect(page.getByTestId("tutor-chat-toggle")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await skipIntroductions(page);
  await expectOnePrimary(page, "runtime", "vscode.activityBar.explorer");
  await expect(page.getByTestId("guided-primary-action")).toBeInViewport();
  await expect(page.getByRole("button", { name: "Arbeitsbereich anzeigen" })).toBeVisible();
});

test("Primäraktion ist per Tastatur ausführbar und Reduced Motion deaktiviert Übergänge am Tutor-Einstieg", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(guidedUrl);
  await ready(page);

  const primary = await expectOnePrimary(page, "platform");
  await primary.focus();
  await expect(primary).toBeFocused();
  await page.keyboard.press("Enter");
  await expectStep(page, 2, "Side Bar einordnen");

  const tutorToggle = page.getByTestId("tutor-chat-toggle");
  await expect
    .poll(() =>
      tutorToggle.evaluate((element) => window.getComputedStyle(element).transitionProperty),
    )
    .toBe("none");
});
