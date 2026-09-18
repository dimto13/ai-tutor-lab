import { expect, test, type Page } from "@playwright/test";

interface TestCredentials {
  email: string;
  password: string;
}

function requireEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for authenticated cloud acceptance.`);
  return name.endsWith("_PASSWORD") ? value : value.trim();
}

function credentials(prefix: string): TestCredentials {
  return {
    email: requireEnvironmentValue(`${prefix}_EMAIL`),
    password: requireEnvironmentValue(`${prefix}_PASSWORD`),
  };
}

async function signIn(page: Page, account: TestCredentials): Promise<void> {
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail").fill(account.email);
  await page.getByLabel("Passwort").fill(account.password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
}

async function completeGuidedTraining(page: Page): Promise<void> {
  await page.goto("/training/artifact-preview-foundation.guided");
  await expect(page.getByRole("status").filter({ hasText: "Training bereit" })).toHaveText(
    "Training bereit",
  );
  await page.getByRole("button", { name: /Team-Übersicht/ }).click();
  await page.getByRole("button", { name: "Quelltext", exact: true }).click();
  await page.getByRole("button", { name: /Freigabestatus ergänzen/ }).click();
  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(page.getByText("Punkte", { exact: true })).toBeVisible();
}

async function expectPersistedActivity(page: Page): Promise<void> {
  const activity = page
    .getByTestId("learning-activities")
    .locator('li[data-session-id]')
    .filter({ hasText: "artifact-preview-foundation" });
  await expect(activity).toHaveCount(1);
  await expect(activity).toContainText("Guided");
  await expect(activity).toContainText(/\d+ Min\./);
}

test("completed Guided training appears once in learning activity and survives a full reload", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await signIn(page, credentials("CLOUD_TEST"));
  await completeGuidedTraining(page);

  // Navigate through the authenticated application after the authoritative completion write.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
  await expectPersistedActivity(page);

  // A hard reload must project the same persisted ScenarioRun rather than transient UI state.
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
  await expectPersistedActivity(page);
});
