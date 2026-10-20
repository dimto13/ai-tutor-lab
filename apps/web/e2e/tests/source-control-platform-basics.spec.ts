import { expect, test, type Page } from "../fixtures/browser-error-guard";

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

test("Explore: inspizierter Fortschritt bleibt ohne Runtime-Snapshot erhalten", async ({
  page,
}) => {
  await page.goto("/training/source-control-platform-basics.explore");
  await waitForTrainingReady(page);
  await page.getByRole("button", { name: /contoso-labs.*onboarding-guide/ }).click();
  await expect(page.getByText("1 von 11 Oberflächen untersucht", { exact: true })).toBeVisible();

  await page.goto("/");
  await page.goto("/training/source-control-platform-basics.explore");
  await waitForTrainingReady(page);
  await expect(page.getByText("1 von 11 Oberflächen untersucht", { exact: true })).toBeVisible();
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

  // #591: a too short description says what is missing, and the guide offers the edit form.
  const feedback = page.getByTestId("guided-orientation");
  await createTrainingPullRequest(page, "Prüfung folgt.");
  await expectGuidedStep(page, 5, "Pull Request nachvollziehbar beschreiben");
  await expect(feedback).toContainText("Die Beschreibung ist noch leer oder zu knapp.");
  await page.getByTestId("guided-recovery-primary-action").click();
  await page.getByRole("textbox", { name: "Pull-Request-Titel" }).fill("");
  await page
    .getByRole("textbox", { name: "Pull-Request-Beschreibung" })
    .fill("Einrichtung geprüft; keine Zugangsdaten enthalten.");
  await page.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  await expectGuidedStep(page, 5, "Pull Request nachvollziehbar beschreiben");
  await expect(feedback).toContainText("Der Titel weicht vom vorgegebenen Titel ab.");

  // The reason survives a reload, and the tutor names it instead of repeating the task.
  await page.reload();
  await waitForTrainingReady(page);
  await expect(feedback).toContainText("Der Titel weicht vom vorgegebenen Titel ab.");
  await page.getByRole("button", { name: "Tutor fragen" }).click();
  await page.getByPlaceholder("Frage an den Tutor…").fill("Ich komme nicht weiter");
  await page.getByRole("button", { name: "Senden" }).click();
  await expect(page.getByRole("region", { name: "Tutor-Verlauf" })).toContainText(
    "Dein letzter Versuch hat den Schritt noch nicht abgeschlossen: Der Titel weicht vom vorgegebenen Titel ab.",
  );

  await page.getByRole("main").getByRole("button", { name: "Pull Request bearbeiten" }).click();
  await page
    .getByRole("textbox", { name: "Pull-Request-Titel" })
    .fill("README um Einstieg ergänzen");
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
  await expect(page.getByTestId("guided-orientation")).toContainText(
    "Deine Antwort ist noch zu knapp.",
  );
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

test("Guided: ein vorab angelegter Pull Request führt Schritt 5 nicht in eine Sackgasse (#591)", async ({
  page,
}) => {
  await page.goto(guidedUrl);
  await waitForTrainingReady(page);

  // Ahead of the steps: a pull request from main with the beta tester's own description.
  await createTrainingPullRequest(page, "Prüfung der Änderung.");
  await expectGuidedStep(page, 1, "Git und GitHub unterscheiden");
  await page.getByRole("button", { name: "Überblick", exact: true }).click();
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await createTrainingBranch(page);
  await page.getByRole("button", { name: "Commits", exact: true }).click();
  await expectGuidedStep(page, 5, "Pull Request nachvollziehbar beschreiben");

  // The creation form is gone; the guide offers the edit form, saving takes the new branch.
  const recovery = page.getByTestId("guided-recovery");
  await expect(recovery).toContainText("Der Pull Request ist schon angelegt");
  await recovery.getByRole("button", { name: "Pull Request bearbeiten" }).click();
  await expect(recovery).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Pull-Request-Beschreibung" })).toHaveValue(
    "Prüfung der Änderung.",
  );
  await page.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  await expectGuidedStep(page, 6, "Tatsächlichen Diff prüfen");
  await expect(
    page.getByText("feature/readme-guide möchte nach main zusammengeführt werden"),
  ).toBeVisible();
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
