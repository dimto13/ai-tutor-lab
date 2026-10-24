import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectSignedIn } from "../helpers/sign-in";

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
  await expectSignedIn(page);
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

const guidedSteps: readonly { title: string; action: (page: Page) => Locator }[] = [
  {
    title: "HTML-Artefakt auswählen",
    action: (page) => page.getByRole("button", { name: /Team-Übersicht/ }),
  },
  {
    title: "Vorschau und Quelltext unterscheiden",
    action: (page) => page.getByRole("button", { name: "Quelltext", exact: true }),
  },
  {
    title: "Deterministische Revision anwenden",
    // Anchored: once the revision is applied, the revision history also names it (#580).
    action: (page) => page.getByRole("button", { name: /^Freigabestatus ergänzen/ }),
  },
  {
    title: "Ergebnis aktiv verifizieren",
    action: (page) => page.getByRole("button", { name: "Ergebnis geprüft", exact: true }),
  },
];

/**
 * The acceptance account keeps its server state between runs. Since training state is really
 * persisted (#528, #545), a run finds the previous completion, or after an aborted run a session in
 * the middle. Both are states the product restores on purpose, so the run continues from them the
 * way a learner would instead of assuming a fresh start. A restored completion is restarted, which
 * also exercises the repeat path that must not award points twice.
 */
async function completeGuidedTraining(page: Page): Promise<number> {
  await page.goto("/training/artifact-preview-foundation.guided");
  await expect(page.getByRole("status").filter({ hasText: "Training bereit" })).toHaveText(
    "Training bereit",
  );
  const completed = page.getByRole("heading", { name: "Training abgeschlossen" });
  const currentStep = page.locator("#guided-current-step-title");
  await expect(completed.or(currentStep).first()).toBeVisible();
  if (await completed.isVisible()) {
    await page.getByRole("button", { name: "Training erneut starten" }).click();
    await expect(completed).toHaveCount(0);
  }

  for (let remaining = guidedSteps.length; remaining > 0; remaining -= 1) {
    const title = ((await currentStep.textContent()) ?? "").trim();
    const step = guidedSteps.find((candidate) => title.endsWith(candidate.title));
    expect(step, `unexpected guided step "${title}"`).toBeTruthy();
    await step!.action(page).click();
    if (step === guidedSteps[guidedSteps.length - 1]) break;
    await expect(currentStep).not.toHaveText(title);
  }

  await expect(completed).toBeVisible();
  await expect(page.locator('[data-completion-save-failure="true"]')).toHaveCount(0);
  return serverConfirmedScore(page);
}

async function latestPersistedActivity(page: Page) {
  const activity = page
    .getByTestId("learning-activities")
    .locator('li[data-session-id][data-scenario-id="artifact-preview-foundation.guided"]')
    .first();
  await expect(activity).toBeVisible();
  await expect(activity).toContainText("Guided");
  await expect(activity).toContainText(/\d+ Min\./);
  const sessionId = await activity.getAttribute("data-session-id");
  expect(sessionId).toBeTruthy();
  return sessionId as string;
}

test("[CLOUD-2] completed Guided training is server-scored and survives a full reload", async ({
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

test("[CLOUD-3] completion and numeric server score survive a fresh authenticated context", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await signIn(page, credentials("CLOUD_TEST"));
  const awarded = await completeGuidedTraining(page);
  const freshContext = await browser.newContext({
    baseURL: requireEnvironmentValue("CLOUD_BASE_URL"),
  });
  try {
    const freshPage = await freshContext.newPage();
    await signIn(freshPage, credentials("CLOUD_TEST"));
    await freshPage.goto("/training/artifact-preview-foundation.guided");
    await expect(freshPage.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
    expect(await serverConfirmedScore(freshPage)).toBe(awarded);
  } finally {
    await freshContext.close();
  }
});

test("[CLOUD-4] replaying a completed Guided scenario does not award a second score", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signIn(page, credentials("CLOUD_TEST"));
  const initial = await completeGuidedTraining(page);
  const afterReplay = await completeGuidedTraining(page);
  expect(afterReplay, "the replay must retain the original server-confirmed award").toBe(initial);
  // Equal point values alone cannot detect a duplicate award: the server could award the same
  // amount twice. Require its explicit existing-ledger disposition on the replay as well.
  const pointsValue = page
    .locator("dt")
    .filter({ hasText: /^Punkte$/ })
    .locator("xpath=following-sibling::dd[1]");
  await expect(pointsValue, "the replay must not create a second score event").toContainText(
    "bereits gewertet",
  );
  await expect(page.getByText("Diese Szenario-Version wurde bereits gewertet.")).toBeVisible();
});
