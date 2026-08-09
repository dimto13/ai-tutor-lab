import { expect, test, type Page } from "@playwright/test";

const scenarioUrl = "/training/vscode-shortcuts.challenge";
const storageKey = "ai-training-lab:vscode-shortcuts.challenge:v2";
const challengeText = "# Status für Marco: Review abgeschlossen.";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function createDirtyChallengeFile(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.py").fill("challenge.py");
  await page.getByPlaceholder("dateiname.py").press("Enter");
  await page.getByPlaceholder('print("Hello AI Training")').fill(challengeText);
}

test.beforeEach(async ({ page }) => {
  await page.goto(scenarioUrl);
  await page.evaluate((key) => window.localStorage.removeItem(key), storageKey);
  await page.reload();
  await waitForTrainingReady(page);
});

test("Speed Challenge: Shortcut-Pfad erreicht den gespeicherten Zielzustand innerhalb des Limits", async ({
  page,
}) => {
  await expect(page.getByText("Harte Zeitgrenze", { exact: true })).toBeVisible();
  await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();

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
  await createDirtyChallengeFile(page);

  await page.evaluate(
    ({ key }) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) throw new Error("training progress missing");
      const progress = JSON.parse(raw) as { startedAt?: number };
      if (typeof progress.startedAt !== "number") throw new Error("training start missing");
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLElement)) throw new Error("active editor missing");

      const originalNow = Date.now;
      Date.now = () => progress.startedAt! + 30_001;
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
    },
    { key: storageKey },
  );

  await expect(page.getByText("Challenge fehlgeschlagen", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).not.toBeVisible();
});

test("Speed Challenge: Ctrl+S außerhalb des Simulators speichert die aktive Datei nicht", async ({
  page,
}) => {
  await createDirtyChallengeFile(page);

  await page.getByPlaceholder("Frage an den Tutor…").focus();
  await page.keyboard.press("Control+S");

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).not.toBeVisible();
  await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();

  await page.getByPlaceholder('print("Hello AI Training")').focus();
  await page.keyboard.press("Control+S");

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Speed Challenge: Timeout ist ein harter Fehlschlag und kann nicht nachträglich erfüllt werden", async ({
  page,
}) => {
  await page.evaluate(
    ({ key }) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) throw new Error("training progress missing");
      const progress = JSON.parse(raw) as Record<string, unknown>;
      window.localStorage.setItem(
        key,
        JSON.stringify({
          ...progress,
          startedAt: Date.now() - 31_000,
          finishedAt: null,
          challengeOutcome: "active",
        }),
      );
    },
    { key: storageKey },
  );

  await page.reload();
  await waitForTrainingReady(page);

  await expect(page.getByText("Challenge fehlgeschlagen", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Zeit abgelaufen. Diese Challenge ist beendet und muss neu gestartet werden.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Challenge neu starten" })).toBeVisible();

  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.py").fill("challenge.py");
  await page.getByPlaceholder("dateiname.py").press("Enter");
  await page.getByPlaceholder('print("Hello AI Training")').fill(challengeText);
  await page.keyboard.press("Control+S");

  await expect(page.getByText("Challenge fehlgeschlagen", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).not.toBeVisible();
});
