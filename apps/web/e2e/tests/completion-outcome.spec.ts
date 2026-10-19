import { expect, test, type Page } from "../fixtures/accessibility-regression";

test.describe.configure({ retries: 0 });

const scenarioUrl = "/training/artifact-preview-foundation.guided";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status").filter({ hasText: "Training bereit" })).toHaveText(
    "Training bereit",
  );
}

async function completeArtifactTraining(page: Page): Promise<void> {
  await page.goto(scenarioUrl);
  await waitForTrainingReady(page);
  await page.getByRole("button", { name: /Team-Übersicht/ }).click();
  await page.getByRole("button", { name: "Quelltext", exact: true }).click();
  await page.getByRole("button", { name: /Freigabestatus ergänzen/ }).click();
  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
}

// #582: Die Dauer ist die gemessene Lernzeit. Eine Pause zwischen zwei Lernaktionen zaehlt
// hoechstens zehn Minuten, auch wenn der Versuch ueber Nacht offen war.
test("a break overnight does not count as learning time", async ({ page }) => {
  const sessionKey =
    "ai-training-lab:tenant:value:local-tenant:user:local-learner:artifact-preview-foundation.guided:mode:guided:state:v4";
  await page.goto(scenarioUrl);
  await waitForTrainingReady(page);
  await page.getByRole("button", { name: /Team-Übersicht/ }).click();
  await page.getByRole("button", { name: "Quelltext", exact: true }).click();
  await page.getByRole("button", { name: /Freigabestatus ergänzen/ }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.value?.activeStepId,
        sessionKey,
      ),
    )
    .toBe("verify-artifact");

  // Der Versuch begann gestern; bis zur letzten Aktion waren drei Minuten Lernzeit gemessen.
  await page.evaluate((key) => {
    const stored = JSON.parse(localStorage.getItem(key) ?? "null");
    const yesterday = Date.now() - 20 * 60 * 60 * 1000;
    stored.value.startedAt = yesterday - 3 * 60 * 1000;
    stored.value.lastActivityAt = yesterday;
    stored.value.activeMs = 3 * 60 * 1000;
    localStorage.setItem(key, JSON.stringify(stored));
  }, sessionKey);
  await page.reload();
  await waitForTrainingReady(page);

  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  const results = page.locator('section[aria-labelledby="completion-results-heading"]');
  const duration = results.getByText("Dauer", { exact: true }).locator("..");
  await expect(duration).toContainText("13 Min.");
});

test("completion shows every required metric, competency state and exactly one follow-up action", async ({
  page,
  accessibility,
}) => {
  await completeArtifactTraining(page);

  const results = page.locator('section[aria-labelledby="completion-results-heading"]');
  await expect(results.getByText("Schritte", { exact: true })).toBeVisible();
  await expect(results.getByText("4 von 4", { exact: true })).toBeVisible();
  await expect(results.getByText("Dauer", { exact: true })).toBeVisible();
  await expect(results.getByText(/Min\./)).toBeVisible();
  await expect(results.getByText("Hinweise", { exact: true })).toBeVisible();
  await expect(results.getByText("Fehlversuche", { exact: true })).toBeVisible();
  await expect(results.getByText("Punkte", { exact: true })).toBeVisible();
  await expect(results.getByText("—", { exact: true })).toBeVisible();

  const competency = page.locator('section[aria-labelledby="completion-competency-heading"]');
  await expect(competency.getByRole("heading", { name: "Kompetenzveränderung" })).toBeVisible();
  await expect(
    competency.getByText(
      "Im lokalen Trainingsmodus ist kein autoritatives Kompetenzprofil verfügbar.",
    ),
  ).toBeVisible();

  const next = page.locator('section[aria-labelledby="completion-next-heading"]');
  const primary = next.locator('[data-primary-completion-action="true"]');
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveAttribute("href", "/training/vscode-basics.guided");
  await expect(primary).toContainText("Starten: Visual Studio Code – Geführte Grundlagen");
  await expect(page.getByRole("button", { name: "Training erneut starten" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Nächstes Modul/ })).toHaveCount(0);

  await accessibility.check("completion outcome with metrics, competency and next action");
});

test("completion remains keyboard reachable without horizontal overflow on a small viewport and can repeat", async ({
  page,
  accessibility,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await completeArtifactTraining(page);

  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

  const primary = page.locator('[data-primary-completion-action="true"]');
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  for (let index = 0; index < 30; index += 1) {
    if (await primary.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(primary).toBeFocused();
  await expect
    .poll(() =>
      primary.evaluate((element) => {
        const style = getComputedStyle(element);
        return style.boxShadow !== "none" || style.outlineStyle !== "none";
      }),
    )
    .toBe(true);

  await accessibility.check("completion outcome on 320px viewport");

  const repeat = page.getByRole("button", { name: "Training erneut starten" });
  await repeat.scrollIntoViewIfNeeded();
  await repeat.click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toHaveCount(0);
  await expect(page.getByTestId("guided-orientation")).toContainText(
    "Schritt 1 – HTML-Artefakt auswählen",
  );
  await expect(page.getByRole("button", { name: /Team-Übersicht/ })).toBeVisible();
});
