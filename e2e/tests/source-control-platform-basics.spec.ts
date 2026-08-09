import { expect, test, type Page } from "@playwright/test";

const guidedUrl = "/training/source-control-platform-basics.guided";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

async function createTrainingBranch(page: Page): Promise<void> {
  await page.getByRole("button", { name: /main/ }).click();
  await page.getByRole("textbox", { name: "Neuer Branch" }).fill("feature/readme-guide");
  await page.getByRole("button", { name: "Erstellen", exact: true }).click();
}

async function createTrainingPullRequest(page: Page, description: string): Promise<void> {
  await page.getByRole("button", { name: "Pull Requests", exact: true }).click();
  await page.getByRole("textbox", { name: "Pull-Request-Beschreibung" }).fill(description);
  await page.getByRole("button", { name: "Pull Request erstellen", exact: true }).click();
}

test("Dashboard: GitHub-Grundlagen bietet Explore, Guided und Challenge an", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "GitHub – Grundlagen" }),
  });
  await expect(card.getByRole("link", { name: /^Explore/ })).toBeVisible();
  await expect(card.getByRole("link", { name: /^Guided/ })).toBeVisible();
  await expect(card.getByRole("link", { name: /^Challenge/ })).toBeVisible();
});

test("Explore: Repository, Pull Request, Review, Checks und Remote-Hilfe frei erkunden", async ({
  page,
}) => {
  await page.goto("/training/source-control-platform-basics.explore");
  await waitForTrainingReady(page);
  await expect(page.getByText("0 von 11 Oberflächen untersucht", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /contoso-labs.*onboarding-guide/ }).click();
  await page.getByRole("button", { name: "Überblick", exact: true }).click();
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await page.getByRole("button", { name: /feature\/readme-guide/ }).click();
  await page.getByRole("button", { name: "Commits", exact: true }).click();
  await page.getByRole("button", { name: "Pull Requests", exact: true }).click();
  await page.getByRole("button", { name: "Geänderte Dateien", exact: true }).click();
  await page.getByRole("button", { name: "Unterhaltung", exact: true }).click();
  await page.getByText("Änderungen angefragt · Jonas Weber", { exact: true }).click();
  await page.getByRole("button", { name: "Checks", exact: true }).click();
  await page.getByRole("button", { name: "Issues", exact: true }).click();
  await page.getByRole("button", { name: "Clone, Fork und Remote verstehen" }).click();

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Guided: kompletter Pull-Request- und Review-Ablauf entsteht durch Aktionen", async ({
  page,
}) => {
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);

  await page.getByRole("button", { name: "Überblick", exact: true }).click();
  await expectGuidedStep(page, 2, "Gehosteten Branch-Stand ansehen");

  await page.getByRole("button", { name: "Code", exact: true }).click();
  await expectGuidedStep(page, 3, "Separaten Arbeitsbranch erstellen");

  await createTrainingBranch(page);
  await expectGuidedStep(page, 4, "Commit-Historie einordnen");

  await page.getByRole("button", { name: "Commits", exact: true }).click();
  await expectGuidedStep(page, 5, "Pull Request nachvollziehbar beschreiben");

  await createTrainingPullRequest(page, "Prüfung folgt.");
  await expectGuidedStep(page, 5, "Pull Request nachvollziehbar beschreiben");
  await page.getByRole("button", { name: "Pull Request bearbeiten", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Pull-Request-Beschreibung" })
    .fill("Einrichtung geprüft; keine Zugangsdaten enthalten.");
  await page.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  await expectGuidedStep(page, 6, "Tatsächlichen Diff prüfen");

  await page.goto("/");
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);
  await expectGuidedStep(page, 6, "Tatsächlichen Diff prüfen");
  await expect(page.getByRole("heading", { name: "README um Einstieg ergänzen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Geänderte Dateien", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Geänderte Dateien", exact: true }).click();
  await expectGuidedStep(page, 7, "Review-Feedback beantworten");

  await page.getByRole("button", { name: "Unterhaltung", exact: true }).click();
  await page.getByRole("textbox", { name: "Antwort auf Review" }).fill("Erledigt.");
  await page.getByRole("button", { name: "Antworten", exact: true }).click();
  await expectGuidedStep(page, 7, "Review-Feedback beantworten");
  await page
    .getByRole("textbox", { name: "Antwort auf Review" })
    .fill("Links und Inhalte geprüft; keine Zugangsdaten enthalten.");
  await page.getByRole("button", { name: "Antwort aktualisieren", exact: true }).click();
  await expectGuidedStep(page, 8, "Status Checks bewerten");

  await page.getByRole("button", { name: "Checks", exact: true }).click();
  await page.getByRole("button", { name: "Checks aktualisieren", exact: true }).click();
  await expectGuidedStep(page, 9, "Merge-Bereitschaft erklären");

  await page.getByRole("button", { name: "Unterhaltung", exact: true }).click();
  await page.getByRole("button", { name: "Bereit zum Merge", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Challenge: Endzustand zählt unabhängig von der Reihenfolge der Teilaktionen", async ({
  page,
}) => {
  await page.goto("/training/source-control-platform-basics.challenge");
  await waitForTrainingReady(page);
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await createTrainingBranch(page);
  await createTrainingPullRequest(page, "Prüfung folgt.");

  await page.getByRole("button", { name: "Checks", exact: true }).click();
  await page.getByRole("button", { name: "Checks aktualisieren", exact: true }).click();
  await page.getByRole("button", { name: "Geänderte Dateien", exact: true }).click();
  await page.getByRole("button", { name: "Unterhaltung", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Antwort auf Review" })
    .fill("Inhalte geprüft und Rückfrage erledigt.");
  await page.getByRole("button", { name: "Antworten", exact: true }).click();

  await page.getByRole("button", { name: "Pull Request bearbeiten", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Pull-Request-Beschreibung" })
    .fill("Links und Einrichtung geprüft.");
  await page.getByRole("button", { name: "Änderungen speichern", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(page.getByText("Challenge erfüllt", { exact: true })).toBeVisible();
});
