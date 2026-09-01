import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
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

type TrainingMode = "explore" | "guided" | "challenge";
type SelfAssessedAiLevel = "beginner" | "intermediate" | "advanced";

interface GraphQLErrorShape {
  message: string;
  errorType?: string;
}

interface GraphQLResult<T> {
  data?: T;
  errors?: GraphQLErrorShape[];
}

interface UserProfileEnvelope {
  displayName: string | null;
  revision: number;
}

interface UserPreferencesEnvelope {
  language: string | null;
  preferredTrainingMode: TrainingMode | null;
  weeklyGoalMinutes: number | null;
  accessibility: unknown;
  selfAssessedAiLevel: SelfAssessedAiLevel | null;
  revision: number;
}

interface AccountRestoreState {
  baseURL: string;
  email: string;
  password: string;
  profile: UserProfileEnvelope;
  preferences: Omit<UserPreferencesEnvelope, "revision">;
}

const accountRestoreByTestId = new Map<string, AccountRestoreState>();

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

async function graphQL<T>(
  page: Page,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const result = await page.evaluate(
    async ({ query: document, variables: operationVariables }) => {
      const outputsResponse = await fetch("/amplify_outputs.json", { cache: "no-store" });
      if (!outputsResponse.ok) {
        throw new Error(`Unable to load Amplify outputs (HTTP ${outputsResponse.status}).`);
      }
      const outputs = (await outputsResponse.json()) as { data?: { url?: string } };
      const dataUrl = outputs.data?.url;
      if (!dataUrl) throw new Error("Live Amplify outputs do not contain data.url.");

      const tokenEntries = Object.entries(localStorage).filter(
        ([key, value]) =>
          (key.endsWith(".accessToken") || key.endsWith(".idToken")) &&
          typeof value === "string" &&
          value.split(".").length === 3,
      );
      tokenEntries.sort(([leftKey], [rightKey]) => {
        const leftRank = leftKey.endsWith(".accessToken") ? 0 : 1;
        const rightRank = rightKey.endsWith(".accessToken") ? 0 : 1;
        return leftRank === rightRank ? leftKey.localeCompare(rightKey) : leftRank - rightRank;
      });
      if (tokenEntries.length === 0) {
        throw new Error("Authenticated Cognito session token was not found in browser storage.");
      }

      let lastResult: GraphQLResult<T> | null = null;
      for (const [, token] of tokenEntries) {
        const response = await fetch(dataUrl, {
          method: "POST",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: document, variables: operationVariables }),
        });
        const candidate = (await response.json()) as GraphQLResult<T>;
        lastResult = candidate;
        const unauthorized = candidate.errors?.some(
          (error) =>
            error.errorType === "UnauthorizedException" ||
            error.message.toLowerCase().includes("not authorized"),
        );
        if (response.ok && !unauthorized) break;
      }

      return lastResult ?? { errors: [{ message: "No Cognito token was accepted by AppSync." }] };
    },
    { query, variables },
  );

  if (result.errors?.length) {
    throw new Error(result.errors.map((error) => error.message).join(" | "));
  }
  if (!result.data) throw new Error("AppSync returned no data.");
  return result.data;
}

const loadUserProfileDocument = `
  query CloudLoadUserProfileForCleanup {
    loadUserProfile {
      displayName
      revision
    }
  }
`;

const saveUserProfileDocument = `
  mutation CloudRestoreUserProfile($displayName: String, $expectedRevision: Int) {
    saveUserProfile(displayName: $displayName, expectedRevision: $expectedRevision) {
      displayName
      revision
    }
  }
`;

const loadUserPreferencesDocument = `
  query CloudLoadUserPreferencesForCleanup {
    loadUserPreferences {
      language
      preferredTrainingMode
      weeklyGoalMinutes
      accessibility
      selfAssessedAiLevel
      revision
    }
  }
`;

const saveUserPreferencesDocument = `
  mutation CloudRestoreUserPreferences(
    $language: String
    $preferredTrainingMode: TrainingMode
    $weeklyGoalMinutes: Int
    $accessibility: AWSJSON
    $selfAssessedAiLevel: SelfAssessedAiLevel
    $expectedRevision: Int
  ) {
    saveUserPreferences(
      language: $language
      preferredTrainingMode: $preferredTrainingMode
      weeklyGoalMinutes: $weeklyGoalMinutes
      accessibility: $accessibility
      selfAssessedAiLevel: $selfAssessedAiLevel
      expectedRevision: $expectedRevision
    ) {
      revision
    }
  }
`;

function encodeAwsJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function captureAccountRestoreState(
  page: Page,
  baseURL: string,
  email: string,
  password: string,
): Promise<AccountRestoreState> {
  const profileData = await graphQL<{ loadUserProfile: UserProfileEnvelope | null }>(
    page,
    loadUserProfileDocument,
  );
  const preferencesData = await graphQL<{
    loadUserPreferences: UserPreferencesEnvelope | null;
  }>(page, loadUserPreferencesDocument);
  if (!profileData.loadUserProfile) {
    throw new Error("Cloud test account must have an existing user profile before mutation.");
  }

  const preferences = preferencesData.loadUserPreferences;
  return {
    baseURL,
    email,
    password,
    profile: profileData.loadUserProfile,
    preferences: {
      language: preferences?.language ?? null,
      preferredTrainingMode: preferences?.preferredTrainingMode ?? null,
      weeklyGoalMinutes: preferences?.weeklyGoalMinutes ?? null,
      accessibility: preferences?.accessibility ?? null,
      selfAssessedAiLevel: preferences?.selfAssessedAiLevel ?? null,
    },
  };
}

async function restoreAccountState(browser: Browser, state: AccountRestoreState): Promise<void> {
  const context = await browser.newContext({ baseURL: state.baseURL });
  try {
    const page = await context.newPage();
    await signIn(page, state.email, state.password);

    const currentProfile = await graphQL<{ loadUserProfile: UserProfileEnvelope | null }>(
      page,
      loadUserProfileDocument,
    );
    if (!currentProfile.loadUserProfile) {
      throw new Error("Cloud cleanup cannot restore a missing user profile.");
    }
    await graphQL(page, saveUserProfileDocument, {
      displayName: state.profile.displayName,
      expectedRevision: currentProfile.loadUserProfile.revision,
    });

    const currentPreferences = await graphQL<{
      loadUserPreferences: UserPreferencesEnvelope | null;
    }>(page, loadUserPreferencesDocument);
    await graphQL(page, saveUserPreferencesDocument, {
      language: state.preferences.language,
      preferredTrainingMode: state.preferences.preferredTrainingMode,
      weeklyGoalMinutes: state.preferences.weeklyGoalMinutes,
      accessibility: encodeAwsJson(state.preferences.accessibility),
      selfAssessedAiLevel: state.preferences.selfAssessedAiLevel,
      expectedRevision: currentPreferences.loadUserPreferences?.revision ?? null,
    });
  } finally {
    await context.close();
  }
}

test.afterEach(async ({ browser }, testInfo) => {
  const restoreState = accountRestoreByTestId.get(testInfo.testId);
  accountRestoreByTestId.delete(testInfo.testId);
  if (!restoreState) return;

  try {
    await restoreAccountState(browser, restoreState);
  } catch (error) {
    // A teardown failure must fail an otherwise green run, but must not replace the original
    // assertion failure when the test is already red.
    if (testInfo.status === testInfo.expectedStatus) throw error;
    console.error("Cloud account cleanup failed after an already failed acceptance test.", error);
  }
});

async function checkedRadioIndex(radios: Locator): Promise<number> {
  const count = await radios.count();
  for (let index = 0; index < count; index += 1) {
    if (await radios.nth(index).isChecked()) return index;
  }
  return -1;
}

test("Cognito login and AppSync profile/preferences survive a fresh browser context", async ({
  browser,
}, testInfo) => {
  const baseURL = requireEnvironmentValue("CLOUD_BASE_URL");
  const email = requireEnvironmentValue("CLOUD_TEST_EMAIL");
  const password = requireEnvironmentValue("CLOUD_TEST_PASSWORD");
  const runMarker = process.env.GITHUB_RUN_ID?.trim() || "local";
  const changedName = `Cloud Acceptance ${runMarker}`;

  const firstContext = await browser.newContext({ baseURL });
  const firstPage = await firstContext.newPage();
  await signIn(firstPage, email, password);
  accountRestoreByTestId.set(
    testInfo.testId,
    await captureAccountRestoreState(firstPage, baseURL, email, password),
  );

  const firstDialog = await openAccountSettings(firstPage);
  const firstNameInput = firstDialog.getByRole("textbox", { name: "Name" });
  const originalName = await firstNameInput.inputValue();
  if (!originalName.trim())
    throw new Error("Cloud test account must have a non-empty display name.");

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

  // Das Seiten-Chrome zeigt den Identitätsnamen aus der authentifizierten Identität, nicht den
  // editierbaren Profilnamen (AccountMenu: identityDisplayName vs. profile.displayName). Die
  // Speicherung wird deshalb dort belegt, wo der Profilwert tatsächlich gilt: im Dialog.
  const firstReopenedDialog = await openAccountSettings(firstPage);
  await expect(firstReopenedDialog.getByRole("textbox", { name: "Name" })).toHaveValue(changedName);
  await closeAccountSettings(firstReopenedDialog);

  await firstContext.close();

  const secondContext = await browser.newContext({ baseURL });
  const secondPage = await secondContext.newPage();
  await signIn(secondPage, email, password);

  const secondDialog = await openAccountSettings(secondPage);
  const secondNameInput = secondDialog.getByRole("textbox", { name: "Name" });
  const secondRadios = secondDialog.getByRole("radio");
  await expect(secondNameInput).toHaveValue(changedName);
  await expect(secondRadios.nth(changedRadioIndex)).toBeChecked();

  await secondNameInput.fill(originalName);
  if (originalRadioIndex >= 0) await secondRadios.nth(originalRadioIndex).check();
  await secondDialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(secondDialog).toBeHidden();

  await secondPage.reload();
  const restoredDialog = await openAccountSettings(secondPage);
  await expect(restoredDialog.getByRole("textbox", { name: "Name" })).toHaveValue(originalName);
  if (originalRadioIndex >= 0) {
    await expect(restoredDialog.getByRole("radio").nth(originalRadioIndex)).toBeChecked();
  }
  await closeAccountSettings(restoredDialog);

  await signOutFromAccountMenu(secondPage);
  await expect(secondPage).toHaveURL(/\/willkommen$/);
  await secondContext.close();
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
