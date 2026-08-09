import { expect, test, type Page } from "@playwright/test";

const scenarioUrl = "/training/vscode-shortcuts.challenge";
const storageKey = "ai-training-lab:vscode-shortcuts.challenge:v2";
const challengeText = "# Status für Marco: Review abgeschlossen.";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
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

  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.py").fill("challenge.py");
  await page.getByPlaceholder("dateiname.py").press("Enter");
  await page.getByPlaceholder('print("Hello AI Training")').fill(challengeText);

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
