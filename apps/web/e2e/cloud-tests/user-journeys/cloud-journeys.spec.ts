import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  closeAccountSettings,
  openAccountSettings,
  signOutFromAccountMenu,
} from "../../helpers/account-settings";
import { expectSignedIn } from "../../helpers/sign-in";
import {
  observeProtectedContent,
  protectedContentObservation,
} from "../../helpers/protected-content-observer";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for real Cognito cloud journeys.`);
  return name.endsWith("_PASSWORD") ? value : value.trim();
}

async function signInAs(page: Page, prefix: string): Promise<void> {
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail").fill(required(`${prefix}_EMAIL`));
  await page.getByLabel("Passwort").fill(required(`${prefix}_PASSWORD`));
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expectSignedIn(page);
  await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
}

async function signIn(page: Page): Promise<void> {
  await signInAs(page, "CLOUD_TEST");
}

async function expectDenied(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/willkommen$/);
  await expect(page.getByRole("heading", { name: "Über KI reden" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Training bereit" })).toHaveCount(0);
  await expect(page.getByTestId("account-menu-trigger")).toHaveCount(0);
}

async function prepareProblem(page: Page, marker: string): Promise<void> {
  await signIn(page);
  await page.goto("/training/vscode-basics.guided");
  await expect(page.getByRole("status").filter({ hasText: "Training bereit" })).toBeVisible();
  await page.getByRole("button", { name: "Ich habe ein Problem", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Problem melden" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByPlaceholder("Beschreibe kurz das Problem oder deinen Verbesserungsvorschlag.")
    .fill(`Synthetische Cloud-Abnahme ${marker}: Meldung aus dem Tutor.`);
}

async function submitProblem(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Problem melden" });
  await dialog.getByRole("button", { name: "Problemmeldung senden" }).click();
  await expect(dialog.getByRole("status")).toContainText("Feedback an die Beta-Inbox gesendet");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
}

test("[CLOUD-1] real Cognito form login reaches authenticated dashboard", async ({ page }) => {
  await signIn(page);
  await expect(page.getByTestId("account-menu-trigger")).toBeVisible();
  await expect(page.locator('[data-dashboard-overview-ready="true"]')).toBeVisible();
});

test("[CLOUD-6] Tutor problem is explicitly submitted and confirmed through UI", async ({
  page,
}) => {
  await prepareProblem(page, `cloud-6-${randomUUID()}`);
  await submitProblem(page);
});

test("[CLOUD-7] Tutor UI problem receives an accepted server mutation response", async ({
  page,
}) => {
  await prepareProblem(page, `cloud-7-${randomUUID()}`);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      (response.request().postData() ?? "").includes("submitBetaFeedback"),
  );
  await submitProblem(page);
  const response = await responsePromise;
  expect(response.ok(), "the authenticated AppSync mutation must return HTTP success").toBe(true);
  const body = (await response.json()) as {
    data?: { submitBetaFeedback?: { accepted?: boolean } | null };
    errors?: unknown[];
  };
  expect(body.errors ?? []).toEqual([]);
  expect(body.data?.submitBetaFeedback?.accepted).toBe(true);
});

test("[CLOUD-9] real Cognito logout denies same-document and fresh-document deep links", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ baseURL: required("CLOUD_BASE_URL") });
  try {
    await observeProtectedContent(context);
    const page = await context.newPage();
    await signIn(page);
    await signOutFromAccountMenu(page);
    await expectDenied(page);

    // Same document: exercise the SPA guard without constructing a synthetic new login.
    await page.evaluate(() => {
      window.history.pushState({}, "", "/training/vscode-basics.guided");
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    });
    await expectDenied(page);

    // New document in the signed-out Cognito context: the local auto-auth fixture is not used.
    await page.goto("/training/vscode-basics.guided");
    await expectDenied(page);
    const observed = await protectedContentObservation(page);
    expect(observed.inspectedMutations).toBeGreaterThan(0);
    expect(observed.findings, "no protected content may flash during fresh navigation").toEqual([]);

    const independentPage = await context.newPage();
    await independentPage.goto("/training/vscode-basics.challenge");
    await expectDenied(independentPage);
    const independentObserved = await protectedContentObservation(independentPage);
    expect(independentObserved.inspectedMutations).toBeGreaterThan(0);
    expect(independentObserved.findings).toEqual([]);
  } finally {
    await context.close();
  }
});

test("[CLOUD-10] account preference changes remain isolated across users and tenants", async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const baseURL = required("CLOUD_BASE_URL");
  const contexts: BrowserContext[] = [];
  let primaryPage: Page | undefined;
  let originalName: string | undefined;
  let changed = false;
  let mainError: unknown;
  let cleanupError: unknown;

  try {
    const primaryContext = await browser.newContext({ baseURL });
    contexts.push(primaryContext);
    primaryPage = await primaryContext.newPage();
    await signInAs(primaryPage, "CLOUD_TEST");
    const primarySettings = await openAccountSettings(primaryPage);
    const primaryName = primarySettings.getByRole("textbox", { name: "Name" });
    originalName = await primaryName.inputValue();
    expect(originalName.trim()).not.toBe("");
    const marker = `cloud-10-${randomUUID()}`;
    await primaryName.fill(marker);
    changed = true;
    await primarySettings.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(primarySettings).toBeHidden();

    for (const prefix of ["CLOUD_TEST_PEER", "CLOUD_TEST_OTHER_TENANT"]) {
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      const page = await context.newPage();
      await signInAs(page, prefix);
      const settings = await openAccountSettings(page);
      await expect(settings.getByRole("textbox", { name: "Name" })).not.toHaveValue(marker);
      await closeAccountSettings(settings);
    }

    await primaryPage.reload();
    const persisted = await openAccountSettings(primaryPage);
    await expect(persisted.getByRole("textbox", { name: "Name" })).toHaveValue(marker);
    await closeAccountSettings(persisted);
  } catch (error) {
    mainError = error;
  } finally {
    testInfo.setTimeout(testInfo.timeout + 60_000);
    if (changed && primaryPage && originalName !== undefined) {
      try {
        const settings = await openAccountSettings(primaryPage);
        await settings.getByRole("textbox", { name: "Name" }).fill(originalName);
        await settings.getByRole("button", { name: "Speichern", exact: true }).click();
        await expect(settings).toBeHidden();
      } catch (error) {
        cleanupError = error;
      }
    }
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
  if (mainError !== undefined && cleanupError !== undefined) {
    throw new AggregateError(
      [mainError, cleanupError],
      "Cloud journey and account restoration failed.",
    );
  }
  if (mainError !== undefined) throw mainError;
  if (cleanupError !== undefined) throw cleanupError;
});
