import { expect, test, type Page } from "../fixtures/accessibility-regression";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

test.describe("Accessibility regressions", () => {
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
    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/willkommen$/);

    await page.goto("/anmelden");
    await expect(page).toHaveURL(/\/anmelden$/);
    await expect(page.getByRole("heading", { name: "AI Training Lab" })).toBeVisible();
    await expect(page.getByLabel("E-Mail")).toBeVisible();
    await expect(page.getByLabel("Passwort")).toBeVisible();

    await accessibility.check("anonymous sign-in page /anmelden");
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
});
