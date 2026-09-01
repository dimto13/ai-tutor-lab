import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  closeAccountSettings,
  openAccountSettings,
  signOutFromAccountMenu,
} from "../helpers/account-settings";

type CloudEnvironmentName =
  | "CLOUD_BASE_URL"
  | "CLOUD_TEST_EMAIL"
  | "CLOUD_TEST_PASSWORD"
  | "CLOUD_TEST_PERSONAL_EMAIL"
  | "CLOUD_TEST_PERSONAL_PASSWORD";

function requireEnvironmentValue(name: CloudEnvironmentName): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for authenticated cloud acceptance.`);
  return name.endsWith("PASSWORD") ? value : value.trim();
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
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
  const baseURL = requireEnvironmentValue("CLOUD_BASE_URL");
  const email = requireEnvironmentValue("CLOUD_TEST_EMAIL");
  const password = requireEnvironmentValue("CLOUD_TEST_PASSWORD");
  const runMarker = process.env.GITHUB_RUN_ID?.trim() || "local";
  const changedName = `Cloud Acceptance ${runMarker}`;

  let originalName: string | null = null;
  let originalRadioIndex = -1;
  let stateWasChanged = false;

  try {
    const firstContext = await browser.newContext({ baseURL });
    const firstPage = await firstContext.newPage();
    await signIn(firstPage, email, password);

    const firstDialog = await openAccountSettings(firstPage);
    const firstNameInput = firstDialog.getByRole("textbox", { name: "Name" });
    originalName = await firstNameInput.inputValue();
    if (!originalName.trim())
      throw new Error("Cloud test account must have a non-empty display name.");

    const firstEmailDisplay = firstDialog.getByTestId("account-email");
    await expect(firstEmailDisplay).toContainText("@");
    await expect(firstEmailDisplay).toContainText("*");

    const firstRadios = firstDialog.getByRole("radio");
    const radioCount = await firstRadios.count();
    if (radioCount < 2) throw new Error("Expected at least two self-assessed AI-level options.");
    originalRadioIndex = await checkedRadioIndex(firstRadios);
    const changedRadioIndex = originalRadioIndex >= 0 ? (originalRadioIndex + 1) % radioCount : 0;

    await firstNameInput.fill(changedName);
    await firstRadios.nth(changedRadioIndex).check();
    await firstDialog.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(firstDialog).toBeHidden();
    stateWasChanged = true;

    const firstReopenedDialog = await openAccountSettings(firstPage);
    await expect(firstReopenedDialog.getByRole("textbox", { name: "Name" })).toHaveValue(changedName);
    await closeAccountSettings(firstReopenedDialog);
    await firstContext.close();

    const secondContext = await browser.newContext({ baseURL });
    const secondPage = await secondContext.newPage();
    await signIn(secondPage, email, password);
    const secondDialog = await openAccountSettings(secondPage);
    await expect(secondDialog.getByRole("textbox", { name: "Name" })).toHaveValue(changedName);
    await expect(secondDialog.getByRole("radio").nth(changedRadioIndex)).toBeChecked();
    await secondContext.close();
  } finally {
    if (stateWasChanged && originalName !== null) {
      const restoreContext = await browser.newContext({ baseURL });
      try {
        const restorePage = await restoreContext.newPage();
        await signIn(restorePage, email, password);
        const restoreDialog = await openAccountSettings(restorePage);
        await restoreDialog.getByRole("textbox", { name: "Name" }).fill(originalName);
        if (originalRadioIndex >= 0) {
          await restoreDialog.getByRole("radio").nth(originalRadioIndex).check();
        }
        await restoreDialog.getByRole("button", { name: "Speichern", exact: true }).click();
        await expect(restoreDialog).toBeHidden();
        await restorePage.reload();
        const restoredDialog = await openAccountSettings(restorePage);
        await expect(restoredDialog.getByRole("textbox", { name: "Name" })).toHaveValue(originalName);
        if (originalRadioIndex >= 0) {
          await expect(restoredDialog.getByRole("radio").nth(originalRadioIndex)).toBeChecked();
        }
        await closeAccountSettings(restoredDialog);
        await signOutFromAccountMenu(restorePage);
        await expect(restorePage).toHaveURL(/\/willkommen$/);
      } finally {
        await restoreContext.close();
      }
    }
  }
});

test("cloud data transparency loads the real tenant policy and exports only the signed-in subject", async ({
  browser,
}) => {
  const baseURL = requireEnvironmentValue("CLOUD_BASE_URL");
  const email = requireEnvironmentValue("CLOUD_TEST_EMAIL");
  const password = requireEnvironmentValue("CLOUD_TEST_PASSWORD");
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await signIn(page, email, password);

  await page.goto("/datentransparenz");
  await expect(
    page.getByRole("heading", { name: "Diese Daten werden über mich gespeichert" }),
  ).toBeVisible();
  await expect(page.getByText("Speichermodus: Cloud", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText(/^Rohtelemetrie: \d+ Tage$/)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Meine Daten als JSON exportieren" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Expected cloud own-data export path.");
  const exported = JSON.parse(await readFile(downloadPath, "utf8")) as {
    subject: { userId: string; tenantId: string };
    storageMode: string;
    serverData: { subject?: { userId?: string; tenantId?: string } } | null;
    excluded: { authTokens: string; tenantAggregates: string };
  };

  expect(exported.storageMode).toBe("cloud");
  expect(exported.subject.userId).toBeTruthy();
  expect(exported.subject.tenantId).toBeTruthy();
  expect(exported.serverData?.subject).toEqual(exported.subject);
  expect(exported.excluded.authTokens).toContain("never exported");
  expect(exported.excluded.tenantAggregates).toContain("not person-specific");
  await expect(page.getByRole("status")).toContainText(
    "Eigendatenexport wurde als JSON-Datei erstellt",
  );
  await context.close();
});

test("cloud data transparency maps missing tenant membership without leaking provider errors", async ({
  browser,
}) => {
  const baseURL = requireEnvironmentValue("CLOUD_BASE_URL");
  const email = requireEnvironmentValue("CLOUD_TEST_PERSONAL_EMAIL");
  const password = requireEnvironmentValue("CLOUD_TEST_PERSONAL_PASSWORD");
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await signIn(page, email, password);

  await page.goto("/datentransparenz");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Dein Datenkontext ist noch nicht verfügbar");
  await expect(alert).not.toContainText("Lambda:Unhandled");
  await expect(alert).not.toContainText("Tenant membership is required");
  await expect(alert).not.toContainText("Exactly one tenant membership is required");
  await expect(page.getByTestId("data-transparency-categories")).toBeVisible();
  await expect(page.getByText("Speichermodus: Cloud", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Rohtelemetrie: \d+ Tage$/)).toHaveCount(0);
  await context.close();
});
