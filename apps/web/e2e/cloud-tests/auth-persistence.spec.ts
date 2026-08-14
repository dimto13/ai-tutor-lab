import { expect, test, type Locator, type Page } from "@playwright/test";

function requireEnvironmentValue(name: "CLOUD_TEST_EMAIL" | "CLOUD_TEST_PASSWORD"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for authenticated cloud acceptance.`);
  return name === "CLOUD_TEST_EMAIL" ? value.trim() : value;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
}

async function openSettings(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function checkedRadioIndex(radios: Locator): Promise<number> {
  const count = await radios.count();
  for (let index = 0; index < count; index += 1) {
    if (await radios.nth(index).isChecked()) return index;
  }
  return -1;
}

test("Cognito login and AppSync profile/preferences survive a fresh browser context", async ({
  browser,
}) => {
  const email = requireEnvironmentValue("CLOUD_TEST_EMAIL");
  const password = requireEnvironmentValue("CLOUD_TEST_PASSWORD");
  const runMarker = process.env.GITHUB_RUN_ID?.trim() || "local";
  const changedName = `Cloud Acceptance ${runMarker}`;

  const firstContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  await signIn(firstPage, email, password);

  const firstDialog = await openSettings(firstPage);
  const firstNameInput = firstDialog.getByRole("textbox", { name: "Name" });
  const originalName = await firstNameInput.inputValue();
  if (!originalName.trim()) throw new Error("Cloud test account must have a non-empty display name.");

  const firstEmailDisplay = firstDialog.getByTestId("account-email");
  await expect(firstEmailDisplay).toContainText("@");
  await expect(firstEmailDisplay).toContainText("*");

  const firstRadios = firstDialog.getByRole("radio");
  const radioCount = await firstRadios.count();
  if (radioCount < 2) throw new Error("Expected at least two self-assessed AI-level options.");
  const originalRadioIndex = await checkedRadioIndex(firstRadios);
  const changedRadioIndex = originalRadioIndex >= 0 ? (originalRadioIndex + 1) % radioCount : 0;

  await firstNameInput.fill(changedName);
  await firstRadios.nth(changedRadioIndex).check();
  await firstDialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(firstDialog).toBeHidden();
  await expect(firstPage.getByText(changedName, { exact: true })).toBeVisible();

  await firstContext.close();

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await signIn(secondPage, email, password);
  await expect(secondPage.getByText(changedName, { exact: true })).toBeVisible();

  const secondDialog = await openSettings(secondPage);
  const secondNameInput = secondDialog.getByRole("textbox", { name: "Name" });
  const secondRadios = secondDialog.getByRole("radio");
  await expect(secondNameInput).toHaveValue(changedName);
  await expect(secondRadios.nth(changedRadioIndex)).toBeChecked();

  await secondNameInput.fill(originalName);
  if (originalRadioIndex >= 0) await secondRadios.nth(originalRadioIndex).check();
  await secondDialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(secondDialog).toBeHidden();

  await secondPage.reload();
  await expect(secondPage.getByText(originalName, { exact: true })).toBeVisible();
  if (originalRadioIndex >= 0) {
    const restoredDialog = await openSettings(secondPage);
    await expect(restoredDialog.getByRole("radio").nth(originalRadioIndex)).toBeChecked();
    await restoredDialog.getByRole("button", { name: "Einstellungen schließen" }).click();
  }

  await secondPage.getByRole("button", { name: "Abmelden" }).click();
  await expect(secondPage).toHaveURL(/\/willkommen$/);
  await secondContext.close();
});
