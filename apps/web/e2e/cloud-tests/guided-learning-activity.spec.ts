import { expect, test, type Page } from "@playwright/test";

interface TestCredentials {
  email: string;
  password: string;
}

function requireEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for authenticated cloud acceptance.`);
  }
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

async function serverConfirmedScore(page: Page): Promise<number> {
  const pointsTerm = page.locator("dt").filter({ hasText: /^Punkte$/ });
  const value = pointsTerm.locator("xpath=following-sibling::dd[1]");
  await expect(value).toHaveText(/^\d+(?:[.,]\d+)?(?: · bereits gewertet)?$/);
  const text = (await value.textContent())?.trim() ?? "";
  const numericText = text.match(/^\d+(?:[.,]\d+)?/)?.[0];
  expect(numericText).toBeTruthy();
  const numeric = Number.parseFloat(numericText!.replace(",", "."));
  expect(Number.isFinite(numeric)).toBe(true);
  expect(numeric).toBeGreaterThan(0);
  return numeric;
}

async function completeGuidedTraining(page: Page): Promise<number> {
  await page.goto("/training/artifact-preview-foundation.guided");
  await expect(page.getByRole("status").filter({ hasText: "Training bereit" })).toHaveText(
    "Training bereit",
  );
  await page.getByRole("button", { name: /Team-Übersicht/ }).click();
  await page.getByRole("button", { name: "Quelltext", exact: true }).click();
  await page.getByRole("button", { name: /Freigabestatus ergänzen/ }).click();
  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(page.locator('[data-completion-save-failure="true"]')).toHaveCount(0);
  return serverConfirmedScore(page);
}

async function latestPersistedActivity(page: Page) {
  const activity = page
    .getByTestId("learning-activities")
    .locator("li[data-session-id]")
    .filter({ hasText: "artifact-preview-foundation" })
    .first();
  await expect(activity).toBeVisible();
  await expect(activity).toContainText("Guided");
  await expect(activity).toContainText(/\d+ Min\./);
  const sessionId = await activity.getAttribute("data-session-id");
  expect(sessionId).toBeTruthy();
  return sessionId as string;
}

test("completed Guided training appears once in learning activity and survives a full reload", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await signIn(page, credentials("CLOUD_TEST"));
  const awardedPoints = await completeGuidedTraining(page);

  // The real product contract is completion save -> server score -> reload. A visible "Punkte"
  // label is not acceptance evidence: after a full reload the completion screen and numeric
  // server-confirmed score must both survive.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(page.locator('[data-completion-save-failure="true"]')).toHaveCount(0);
  expect(await serverConfirmedScore(page)).toBe(awardedPoints);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
  const sessionId = await latestPersistedActivity(page);

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
  const persistedSession = page
    .getByTestId("learning-activities")
    .locator(`li[data-session-id="${sessionId}"]`);
  await expect(persistedSession).toHaveCount(1);
  await expect(persistedSession).toContainText("Guided");
  await expect(persistedSession).toContainText(/\d+ Min\./);
});
