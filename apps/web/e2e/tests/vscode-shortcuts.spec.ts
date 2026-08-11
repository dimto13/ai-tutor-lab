import { expect, test, type Page } from "@playwright/test";

const scenarioUrl = "/training/vscode-shortcuts.challenge";
const storageKey =
  "ai-training-lab:tenant:value:local-tenant:user:local-learner:vscode-shortcuts.challenge:mode:challenge:state:v4";
const legacyStorageKey =
  "ai-training-lab:tenant:value:local-tenant:user:local-learner:vscode-shortcuts.challenge:v3";
const challengeText = "Status für Marco: Review abgeschlossen.";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectChallengeBriefing(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", {
      name: "Datei in 30 Sekunden erstellen, befüllen und speichern",
    }),
  ).toBeVisible();
  await expect(page.getByText("Aufgabenbriefing", { exact: true })).toBeVisible();
  await expect(page.getByText(/Die Zeit läuft noch nicht\./)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Aufgabe verstanden · 30 Sekunden starten", exact: true }),
  ).toBeVisible();
}

async function startChallenge(page: Page): Promise<void> {
  await expectChallengeBriefing(page);
  await page
    .getByRole("button", { name: "Aufgabe verstanden · 30 Sekunden starten", exact: true })
    .click();
  await waitForTrainingReady(page);
  await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();
}

async function createDirtyChallengeFile(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.ext").fill("challenge.txt");
  await page.getByPlaceholder("dateiname.ext").press("Enter");
  await page.getByRole("textbox", { name: "Editor-Inhalt" }).fill(challengeText);
}

async function persistedStartedAt(page: Page): Promise<number> {
  const readStartedAt = () =>
    page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const envelope = JSON.parse(raw) as { value?: { startedAt?: number } };
      return typeof envelope.value?.startedAt === "number" ? envelope.value.startedAt : null;
    }, storageKey);

  await expect.poll(readStartedAt).toEqual(expect.any(Number));
  const startedAt = await readStartedAt();
  if (typeof startedAt !== "number") throw new Error("training start missing");
  return startedAt;
}

test.beforeEach(async ({ page }) => {
  await page.goto(scenarioUrl);
  await page.evaluate(
    (keys) => {
      for (const key of keys) window.localStorage.removeItem(key);
    },
    [storageKey, legacyStorageKey],
  );
  await page.reload();
  await waitForTrainingReady(page);
});

test("Speed Challenge: Aufgabe wird vor dem Start erklärt und Countdown startet erst nach Bestätigung", async ({
  page,
}) => {
  await expectChallengeBriefing(page);
  await page.waitForTimeout(1_200);
  await expect(page.getByText(/Die Zeit läuft noch nicht\./)).toBeVisible();

  await startChallenge(page);
  await expect(page.getByText("Harte Zeitgrenze", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Suche", exact: true }).click();
  await expect(page.getByRole("button", { name: "Neue Datei", exact: true })).not.toBeVisible();
  await page.keyboard.press("Control+Shift+E");
  await expect(page.getByRole("button", { name: "Neue Datei", exact: true })).toBeVisible();

  await createDirtyChallengeFile(page);

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).not.toBeVisible();

  await page.keyboard.press("Control+S");

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(page.getByText("Lösungsvergleich", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Mit Ctrl+S speichern. Entscheidend sind korrekter Inhalt und gespeicherter Endzustand vor Ablauf der Zeit.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("Speed Challenge: Erfolgsereignis nach der Deadline wird vor dem nächsten Timer-Tick abgelehnt", async ({
  page,
}) => {
  await startChallenge(page);
  await createDirtyChallengeFile(page);
  const startedAt = await persistedStartedAt(page);

  await page.evaluate((challengeStartedAt) => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) throw new Error("active editor missing");

    const originalNow = Date.now;
    Date.now = () => challengeStartedAt + 30_001;
    try {
      activeElement.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "s",
          code: "KeyS",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    } finally {
      Date.now = originalNow;
    }
  }, startedAt);

  await expect(page.getByText("Neuer Versuch", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).not.toBeVisible();
});

test("Speed Challenge: Ctrl+S außerhalb des Simulators speichert die aktive Datei nicht", async ({
  page,
}) => {
  await startChallenge(page);
  await createDirtyChallengeFile(page);

  await page.getByPlaceholder("Frage an den Tutor…").focus();
  await page.keyboard.press("Control+S");

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).not.toBeVisible();
  await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();

  await page.getByRole("textbox", { name: "Editor-Inhalt" }).focus();
  await page.keyboard.press("Control+S");

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Speed Challenge: Shortcuts bleiben nach Klick auf eine nicht fokussierbare Simulatorfläche aktiv", async ({
  page,
}) => {
  await startChallenge(page);
  await createDirtyChallengeFile(page);

  await page.getByRole("button", { name: "Suche", exact: true }).click();
  await expect(page.getByRole("button", { name: "Neue Datei", exact: true })).not.toBeVisible();

  await page.getByText("main", { exact: true }).click();
  await page.keyboard.press("Control+Shift+E");
  await expect(page.getByRole("button", { name: "Neue Datei", exact: true })).toBeVisible();

  await page.keyboard.press("Control+S");
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Speed Challenge: Timeout führt zurück ins Briefing und ein neuer Versuch braucht Bestätigung", async ({
  page,
}) => {
  await startChallenge(page);
  const startedAt = await persistedStartedAt(page);

  await page.evaluate((challengeStartedAt) => {
    const globalWindow = window as typeof window & { __realDateNow?: typeof Date.now };
    globalWindow.__realDateNow = Date.now;
    Date.now = () => challengeStartedAt + 31_000;
  }, startedAt);

  await expect(page.getByText("Neuer Versuch", { exact: true })).toBeVisible();
  await expect(page.getByText(/Die Zeit des letzten Versuchs ist abgelaufen\./)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Neuen Versuch starten · 30 Sekunden", exact: true }),
  ).toBeVisible();

  await page.evaluate(() => {
    const globalWindow = window as typeof window & { __realDateNow?: typeof Date.now };
    if (globalWindow.__realDateNow) Date.now = globalWindow.__realDateNow;
    delete globalWindow.__realDateNow;
  });

  await page
    .getByRole("button", { name: "Neuen Versuch starten · 30 Sekunden", exact: true })
    .click();
  await waitForTrainingReady(page);
  await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();
});
