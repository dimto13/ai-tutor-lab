import { expect, test } from "../fixtures/browser-error-guard";

const registeredScenarioIds = [
  "vscode-basics.explore",
  "vscode-basics.guided",
  "vscode-basics.challenge",
  "vscode-shortcuts.challenge",
  "developer-workflow-basics.explore",
  "git-basics",
  "developer-workflow-basics.challenge",
  "copilot-basics.explore",
  "copilot-basics.guided",
  "copilot-basics.challenge",
  "artifact-preview-foundation.guided",
  "html-page-workflow.explore",
  "html-page-workflow.guided",
  "html-page-workflow.challenge",
  "research-workflow.explore",
  "research-workflow.guided",
  "research-workflow.challenge",
  "source-control-platform-basics.explore",
  "source-control-platform-basics.guided",
  "source-control-platform-basics.challenge",
  "claude-code-basics.guided",
] as const;

test("unbekannte Trainings-ID liefert einen deutschen 404 ohne technische Interna", async ({
  page,
}) => {
  const response = await page.goto("/training/gibt-es-nicht");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Training nicht gefunden" })).toBeVisible();
  await expect(
    page.getByText("Das angeforderte Training wurde nicht gefunden oder ist nicht mehr verfügbar.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Zurück zur Trainingsübersicht" })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(page.locator("body")).not.toContainText("Unknown training scenario");
  await expect(page.locator("body")).not.toContainText("gibt-es-nicht");
  await expect(page.locator("body")).not.toContainText("This page didn't load");
});

test("Dashboard verlinkt nur Trainingsszenarien, die als Route erreichbar sind", async ({
  page,
}) => {
  await page.goto("/");

  const trainingLinks = await page.locator('a[href^="/training/"]').evaluateAll((links) => [
    ...new Set(
      links
        .map((link) => link.getAttribute("href"))
        .filter((href): href is string => typeof href === "string"),
    ),
  ]);

  expect(trainingLinks.length).toBeGreaterThan(0);
  for (const href of trainingLinks) {
    const response = await page.request.get(href);
    expect(response.status(), `Dashboard-Link ${href}`).toBe(200);
  }
});

test("alle aktuell registrierten Trainingsszenarien liefern HTTP 200", async ({ page }) => {
  for (const scenarioId of registeredScenarioIds) {
    const response = await page.request.get(`/training/${encodeURIComponent(scenarioId)}`);
    expect(response.status(), `Szenario ${scenarioId}`).toBe(200);
  }
});

test("eine komplett unbekannte allgemeine Route bleibt HTTP 404", async ({ page }) => {
  const response = await page.goto("/diese-route-gibt-es-nicht");
  expect(response?.status()).toBe(404);
});
