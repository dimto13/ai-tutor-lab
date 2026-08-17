import { expect, test, type Page } from "../fixtures/accessibility-regression";

test.describe.configure({ retries: 0 });

async function waitForDashboardOverview(page: Page): Promise<void> {
  await expect(page.locator('[data-dashboard-overview-ready="true"]')).toBeVisible();
}

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

async function runTerminalCommand(page: Page, command: string): Promise<void> {
  const input = page.getByLabel("Terminal-Eingabe");
  await input.fill(command);
  await input.press("Enter");
}

async function waitForPersistedScenario(page: Page, scenarioId: string): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        (expectedScenarioId) =>
          Object.entries(localStorage).some(
            ([key, value]) =>
              key.includes(expectedScenarioId) || value.includes(expectedScenarioId),
          ),
        scenarioId,
      ),
    )
    .toBe(true);
}

test("first-user dashboard shows competency state and exactly one deterministic next action", async ({
  page,
  accessibility,
}) => {
  await page.goto("/");
  await waitForDashboardOverview(page);

  await expect(page.getByRole("heading", { name: "Dein Kompetenzprofil" })).toBeVisible();
  await expect(page.getByText("Im lokalen Modus nicht autoritativ verfügbar")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dein nächster Schritt" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alle Trainings" })).toBeVisible();

  const primary = page.locator('[data-primary-dashboard-action="true"]');
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveAttribute("href", "/training/vscode-basics.guided");
  await expect(primary).toContainText("Starten: Visual Studio Code – Geführte Grundlagen");

  await accessibility.check("competency-first first-user dashboard /");
});

test("an unfinished training becomes the one primary action and resumes exact session plus runtime state", async ({
  page,
}) => {
  await page.goto("/training/git-basics");
  await waitForTrainingReady(page);

  await expectGuidedStep(page, 1, "Aktuellen Branch prüfen");
  await runTerminalCommand(page, "git branch --show-current");
  await expectGuidedStep(page, 2, "Working Tree vor der Änderung prüfen");
  await runTerminalCommand(page, "git status");
  await expectGuidedStep(page, 3, "Eigenen Feature-Branch anlegen");
  await runTerminalCommand(page, "git switch -c feature/addition");
  await expectGuidedStep(page, 4, "Copilot Chat öffnen");
  await waitForPersistedScenario(page, "git-basics");

  await page.goto("/");
  await waitForDashboardOverview(page);

  const primary = page.locator('[data-primary-dashboard-action="true"]');
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveAttribute("href", "/training/git-basics");
  await expect(primary).toContainText("Fortsetzen:");
  await expect(page.getByText(/Weiter geht es bei „Copilot Chat öffnen“/)).toBeVisible();

  await primary.click();
  await waitForTrainingReady(page);
  await expectGuidedStep(page, 4, "Copilot Chat öffnen");
  await expect(page.locator('[data-highlight="vscode.statusBar"]')).toContainText(
    "feature/addition",
  );
  await expect(
    page.getByText("Switched to a new branch 'feature/addition'", { exact: true }),
  ).toBeVisible();
});

test("multiple unfinished trainings use persisted recency and keep every other resume directly reachable", async ({
  page,
}) => {
  await page.goto("/training/vscode-basics.guided");
  await waitForTrainingReady(page);
  await waitForPersistedScenario(page, "vscode-basics.guided");

  await page.goto("/training/source-control-platform-basics.guided");
  await waitForTrainingReady(page);
  await waitForPersistedScenario(page, "source-control-platform-basics.guided");

  await page.goto("/");
  await waitForDashboardOverview(page);

  const nextAction = page.locator('section[aria-labelledby="dashboard-next-action-heading"]');
  const primary = nextAction.locator('[data-primary-dashboard-action="true"]');
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveAttribute("href", "/training/source-control-platform-basics.guided");
  await expect(
    nextAction.getByRole("link", { name: /Fortsetzen: Visual Studio Code – Geführte Grundlagen/ }),
  ).toHaveAttribute("href", "/training/vscode-basics.guided");
});

test("primary recommendation stays keyboard reachable with visible focus on a small viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await waitForDashboardOverview(page);

  const primary = page.locator('[data-primary-dashboard-action="true"]');
  await expect(primary).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

  await page.locator("body").click({ position: { x: 1, y: 1 } });
  for (let index = 0; index < 8; index += 1) {
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
});
