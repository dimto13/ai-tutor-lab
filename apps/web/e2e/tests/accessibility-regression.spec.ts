import { expect, test, type Locator, type Page } from "../fixtures/accessibility-regression";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function activateWithKeyboard(page: Page, target: Locator): Promise<void> {
  await target.focus();
  await expect(target).toBeFocused();
  await page.keyboard.press("Enter");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

test.describe("Accessibility regressions", () => {
  test.describe.configure({ retries: 0 });

  test("dashboard / has no unapproved axe violations", async ({ page, accessibility }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();

    await accessibility.check("dashboard /");
  });

  test("public landing /willkommen has no unapproved axe violations", async ({
    page,
    accessibility,
  }) => {
    await page.goto("/willkommen");
    await expect(page.getByRole("heading", { name: "Über KI reden" })).toBeVisible();

    await accessibility.check("public landing /willkommen");
  });

  test("anonymous sign-in page /anmelden has no unapproved axe violations", async ({
    page,
    accessibility,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
    await page.getByTestId("account-menu-trigger").click();
    const accountMenu = page.getByTestId("account-menu-popover");
    await expect(accountMenu).toBeVisible();
    await accountMenu.getByRole("button", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/willkommen$/);

    await page.getByRole("link", { name: "Anmelden" }).click();
    await expect(page).toHaveURL(/\/anmelden$/);
    await expect(page.getByRole("heading", { name: "AI Training Lab" })).toBeVisible();
    await expect(page.getByLabel("E-Mail")).toBeVisible();
    await expect(page.getByLabel("Passwort")).toBeVisible();

    await accessibility.check("anonymous sign-in page /anmelden");
    await expect(page).toHaveURL(/\/anmelden$/);
  });

  test("competency profile /kompetenz has no unapproved axe violations", async ({
    page,
    accessibility,
  }) => {
    await page.goto("/kompetenz");
    await expect(page.getByRole("heading", { name: "Mein Kompetenzprofil" })).toBeVisible();

    await accessibility.check("competency profile /kompetenz");
  });

  test("Explore training with platform guide has no unapproved axe violations", async ({
    page,
    accessibility,
  }) => {
    await page.goto("/training/vscode-basics.explore");
    await waitForTrainingReady(page);
    await expect(page.getByRole("heading", { name: "Oberfläche frei untersuchen" })).toBeVisible();
    await expect(page.locator('[data-platform-ui="guide"]')).toBeVisible();

    const tutorHistory = page.getByRole("region", { name: "Tutor-Verlauf" });
    await expect(tutorHistory).toHaveAttribute("tabindex", "0");
    await tutorHistory.focus();
    await expect(tutorHistory).toBeFocused();

    await accessibility.check("vscode-basics.explore with platform guide");
  });

  test("Guided training with active spotlight has no unapproved axe violations", async ({
    page,
    accessibility,
  }) => {
    await page.goto("/training/vscode-basics.guided");
    await waitForTrainingReady(page);
    await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
    await expect(page.getByRole("heading", { name: "Schritt 7 – Explorer öffnen" })).toBeVisible();
    await expect(page.locator('[data-highlight-kind="guided"]')).toBeVisible();

    await accessibility.check("vscode-basics.guided with active spotlight");
  });

  test("Challenge training with platform guide has no unapproved axe violations", async ({
    page,
    accessibility,
  }) => {
    await page.goto("/training/vscode-basics.challenge");
    await waitForTrainingReady(page);
    await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();
    await expect(page.locator('[data-platform-ui="guide"]')).toBeVisible();

    await accessibility.check("vscode-basics.challenge with platform guide");
  });

  test("Guided VS-Code-Grundlagen sind ohne Maus vollständig abschließbar", async ({ page }) => {
    await page.goto("/training/vscode-basics.guided");
    await waitForTrainingReady(page);

    await expectGuidedStep(page, 1, "Activity Bar einordnen");
    await activateWithKeyboard(
      page,
      page.getByRole("button", { name: "Grundbegriffe überspringen" }),
    );
    await expectGuidedStep(page, 7, "Explorer öffnen");

    await activateWithKeyboard(page, page.getByRole("button", { name: "Explorer", exact: true }));
    await expectGuidedStep(page, 8, "Einen Ordner als Arbeitskontext öffnen");

    await activateWithKeyboard(page, page.getByRole("button", { name: "File", exact: true }));
    await activateWithKeyboard(page, page.getByRole("menuitem", { name: /Open Folder\.\.\./ }));
    await expectGuidedStep(page, 9, "Datei erstellen");

    await activateWithKeyboard(page, page.getByRole("button", { name: "Neue Datei", exact: true }));
    const filename = page.getByPlaceholder("dateiname.ext");
    await filename.fill("notiz.txt");
    await filename.press("Enter");
    await expectGuidedStep(page, 10, "Datei bearbeiten und speichern");

    const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
    await editor.fill("Hello AI Training");
    await editor.press("Control+s");
    await expectGuidedStep(page, 11, "Bereich und Ansichten unterscheiden");

    await activateWithKeyboard(page, page.getByRole("button", { name: "Terminal", exact: true }));
    await activateWithKeyboard(page, page.getByRole("menuitem", { name: /New Terminal/ }).first());
    await expectGuidedStep(page, 12, "Probleme-Ansicht verwenden");

    await activateWithKeyboard(page, page.getByRole("button", { name: "Problems", exact: true }));
    await expectGuidedStep(page, 13, "Ausgabe-Ansicht verwenden");

    await activateWithKeyboard(page, page.getByRole("button", { name: "Output", exact: true }));
    await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  });

  test("Challenge-Endzustand ist ohne Maus erreichbar", async ({ page }) => {
    await page.goto("/training/vscode-basics.challenge");
    await waitForTrainingReady(page);

    await activateWithKeyboard(page, page.getByRole("button", { name: "Explorer", exact: true }));
    await activateWithKeyboard(
      page,
      page.getByRole("button", { name: "ai-training-demo", exact: true }),
    );
    await activateWithKeyboard(page, page.getByRole("button", { name: "Neue Datei", exact: true }));

    const filename = page.getByPlaceholder("dateiname.ext");
    await filename.fill("challenge.txt");
    await filename.press("Enter");

    const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
    await editor.fill("VS Code Grundlagen abgeschlossen");
    await editor.press("Control+s");

    await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  });

  test("Explore-Oberflächen lassen sich per Tastatur untersuchen und textuell auswerten", async ({
    page,
    accessibility,
  }) => {
    await page.goto("/training/vscode-basics.explore");
    await waitForTrainingReady(page);

    await expect(page.getByText("0 von 23 Oberflächen untersucht", { exact: true })).toBeVisible();
    await activateWithKeyboard(page, page.getByRole("button", { name: "Explorer", exact: true }));
    await expect(page.getByText("1 von 23 Oberflächen untersucht", { exact: true })).toBeVisible();
    await expect(page.getByText(/Der Explorer zeigt Dateien und Ordner/)).toBeVisible();

    const status = page
      .getByTestId("explore-surface-status")
      .filter({ has: page.getByText("Explorer", { exact: true }) });
    await expect(status).toHaveAttribute("data-explore-status", "completed");
    await expect(status).toContainText("Erledigt");

    await accessibility.check("keyboard Explore interaction with textual status");
  });

  test("Guided-Highlight wird angesagt und bleibt zusätzliche, nicht alleinige Information", async ({
    page,
    accessibility,
  }) => {
    await page.goto("/training/vscode-basics.guided");
    await waitForTrainingReady(page);
    await activateWithKeyboard(
      page,
      page.getByRole("button", { name: "Grundbegriffe überspringen" }),
    );

    const primaryAction = page.getByTestId("guided-primary-action");
    const announcement = page.getByTestId("highlight-announcement");
    await expect(primaryAction).toContainText(/Explorer/i);
    await expect(page.getByTestId("highlight-frame")).toBeVisible();
    await expect(announcement).toHaveAttribute("aria-live", "polite");
    await expect(announcement).toHaveAttribute("aria-atomic", "true");
    await expect(announcement).toContainText(/Explorer/i);

    const highlightToggle = page.getByRole("button", { name: "Highlights", exact: true });
    await activateWithKeyboard(page, highlightToggle);
    await expect(page.getByTestId("highlight-frame")).toHaveCount(0);
    await expect(announcement).toHaveCount(0);
    await expect(primaryAction).toContainText(/Explorer/i);

    await accessibility.check("guided instruction without visual highlight");
  });

  test("Guided Meta-UI bleibt bei 320px und Reduced Motion per Tastatur erreichbar", async ({
    page,
    accessibility,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/training/vscode-basics.guided");
    await waitForTrainingReady(page);

    const guideToggle = page.getByRole("button", { name: "Guide anzeigen" });
    await activateWithKeyboard(page, guideToggle);
    await expect(
      page.getByRole("heading", { name: "Schritt 1 – Activity Bar einordnen" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Arbeitsbereich anzeigen" })).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);

    await accessibility.check("guided 320px reduced-motion keyboard meta UI");
  });
});
