import { expect, test, type Page } from "../fixtures/browser-error-guard";

const scenarioUrl = "/training/vscode-shortcuts.challenge";
const sessionStorageKey =
  "ai-training-lab:tenant:value:local-tenant:user:local-learner:vscode-shortcuts.challenge:mode:challenge:state:v4";
const legacySessionStorageKey =
  "ai-training-lab:tenant:value:local-tenant:user:local-learner:vscode-shortcuts.challenge:v3";
const attemptHistoryStorageKey =
  "ai-training-lab:tenant:value:local-tenant:user:local-learner:vscode-shortcuts.challenge:mode:challenge:runtime:platform%3A%3Achallenge-attempt-history:v3";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function readStartedAt(page: Page): Promise<number> {
  const currentStartedAt = () =>
    page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const envelope = JSON.parse(raw) as { value?: { startedAt?: number } };
      return typeof envelope.value?.startedAt === "number" ? envelope.value.startedAt : null;
    }, sessionStorageKey);

  await expect.poll(currentStartedAt).toEqual(expect.any(Number));
  const startedAt = await currentStartedAt();
  if (typeof startedAt !== "number") throw new Error("challenge start missing");
  return startedAt;
}

async function restoreClock(page: Page): Promise<void> {
  await page.evaluate(() => {
    const globalWindow = window as typeof window & { __realDateNow?: typeof Date.now };
    if (globalWindow.__realDateNow) Date.now = globalWindow.__realDateNow;
    delete globalWindow.__realDateNow;
  });
}

async function expireCurrentAttempt(page: Page): Promise<void> {
  const startedAt = await readStartedAt(page);
  await page.evaluate((challengeStartedAt) => {
    const globalWindow = window as typeof window & { __realDateNow?: typeof Date.now };
    globalWindow.__realDateNow ??= Date.now;
    Date.now = () => challengeStartedAt + 31_000;
  }, startedAt);
  await expect(page.getByText("Neuer Versuch", { exact: true })).toBeVisible();
  await restoreClock(page);
}

async function startInitialAttempt(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Aufgabe verstanden · 30 Sekunden starten", exact: true })
    .click();
  await waitForTrainingReady(page);
  await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();
}

async function startRetry(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Neuen Versuch starten · 30 Sekunden", exact: true })
    .click();
  await waitForTrainingReady(page);
  await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto(scenarioUrl);
  await page.evaluate(
    (keys) => {
      for (const key of keys) window.localStorage.removeItem(key);
    },
    [sessionStorageKey, legacySessionStorageKey, attemptHistoryStorageKey],
  );
  await page.reload();
  await waitForTrainingReady(page);
});

test("Challenge empfiehlt Guided nach zwei Timeouts, erzwingt ihn nicht und stellt die Empfehlung nach Reload wieder her", async ({
  page,
}) => {
  await startInitialAttempt(page);
  await expireCurrentAttempt(page);

  await expect(page.getByTestId("guided-after-challenge-recommendation")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Neuen Versuch starten · 30 Sekunden", exact: true }),
  ).toBeVisible();

  await startRetry(page);
  await expireCurrentAttempt(page);

  await expect(page.getByTestId("guided-after-challenge-recommendation")).toBeVisible();
  await expect(page.getByRole("link", { name: "Guided-Modus öffnen", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Neuen Versuch starten · 30 Sekunden", exact: true }),
  ).toBeVisible();

  await page.reload();
  await waitForTrainingReady(page);

  await expect(page.getByText("Neuer Versuch", { exact: true })).toBeVisible();
  await expect(page.getByTestId("guided-after-challenge-recommendation")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Neuen Versuch starten · 30 Sekunden", exact: true }),
  ).toBeVisible();
});
