import { expect, test, type Page } from "@playwright/test";

const legacyGuidedStepIds = [
  "open-copilot-chat",
  "session-vs-conversation",
  "new-conversation",
  "use-file-context",
  "select-plan-mode",
  "understand-chat-modes",
  "select-explicit-model",
  "select-auto-model",
  "accept-inline-suggestion",
  "understand-mcp",
  "understand-agent-skills",
] as const;

async function openCopilotScenario(page: Page) {
  await page.goto("/training/copilot-basics.guided");
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await expect(page.getByText("GitHub Copilot – Grundlagen")).toBeVisible();
}

async function completeIntroSteps(page: Page) {
  for (let index = 1; index <= 3; index += 1) {
    await expect(page.getByText(new RegExp(`Schritt ${index} –`))).toBeVisible();
    await page.getByRole("button", { name: "Grundbegriff verstanden" }).click();
  }
}

async function clickCurrentConceptButton(page: Page) {
  await page.getByRole("button", { name: "Konzept verstanden" }).click();
}

test("ein abgeschlossener Legacy-Fortschritt bleibt nach neuen optionalen Schritten abgeschlossen", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate((stepIds) => {
    localStorage.setItem(
      "ai-training-lab:copilot-basics.guided:v2",
      JSON.stringify({
        statuses: Object.fromEntries(stepIds.map((stepId) => [stepId, "COMPLETED"])),
        activeStepId: null,
        startedAt: 1_786_280_000_000,
        finishedAt: 1_786_283_600_000,
        challengeOutcome: null,
        hintsUsed: 2,
        mistakes: 1,
        lastAction: null,
        exploredTargets: [],
        lastInspectedRef: null,
      }),
    );
  }, legacyGuidedStepIds);

  await openCopilotScenario(page);
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(page.getByText("14 von 14", { exact: true })).toBeVisible();
  await expect(page.getByText("140", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Grundbegriffe überspringen" })).toHaveCount(0);
});

test("Copilot Grundlagen ist von Schritt 1 bis 14 vollständig und plausibel durchlaufbar", async ({
  page,
}) => {
  await openCopilotScenario(page);

  await completeIntroSteps(page);
  await expect(page.getByText("Schritt 4 – Copilot Chat öffnen")).toBeVisible();
  await page.getByRole("button", { name: "Copilot", exact: true }).click();

  const chat = page.locator('[data-highlight="copilot.chat"]');
  await expect(chat).toBeVisible();
  await expect(chat).toBeInViewport();
  const chatBox = await chat.boundingBox();
  expect(chatBox).not.toBeNull();
  expect(chatBox!.x).toBeGreaterThanOrEqual(0);
  expect(chatBox!.y).toBeGreaterThanOrEqual(0);
  expect(chatBox!.x + chatBox!.width).toBeLessThanOrEqual(1280);
  expect(chatBox!.y + chatBox!.height).toBeLessThanOrEqual(720);
  expect(
    await chat.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
      const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + 36));
      const hit = document.elementFromPoint(x, y);
      return hit !== null && element.contains(hit);
    }),
  ).toBe(true);
  await page.setViewportSize({ width: 323, height: 646 });
  const narrowChatBox = await chat.boundingBox();
  expect(narrowChatBox).not.toBeNull();
  expect(narrowChatBox!.x).toBeGreaterThanOrEqual(0);
  expect(narrowChatBox!.x + narrowChatBox!.width).toBeLessThanOrEqual(323);
  await page.setViewportSize({ width: 1280, height: 720 });

  await expect(
    page.getByText("Schritt 5 – Training-Session und Copilot-Unterhaltung unterscheiden"),
  ).toBeVisible();
  await clickCurrentConceptButton(page);

  await expect(page.getByText("Schritt 6 – Neue Copilot-Unterhaltung beginnen")).toBeVisible();
  await page.getByRole("button", { name: "Neue Copilot-Unterhaltung" }).click();
  await expect(page.getByText(/calculator\.py bleibt als Arbeitskontext erhalten/)).toBeVisible();
  await expect(page.getByText("Schritt 7 – Dateikontext bewusst nutzen")).toBeVisible();

  const prompt = page.getByPlaceholder("Ask Copilot...");
  await expect(page.getByText("Kontext: calculator.py")).toBeVisible();
  await prompt.fill("test");
  await prompt.press("Enter");
  await expect(page.getByText("Schritt 7 – Dateikontext bewusst nutzen")).toBeVisible();
  await expect(page.getByText(/erwartete Inhalt fehlt noch/)).toBeVisible();

  await prompt.fill("Was macht die aktuell geöffnete Datei?");
  await prompt.press("Enter");
  await expect(
    page.getByText(/calculator\.py.*def add\(a, b\):.*noch keinen Funktionskörper/),
  ).toBeVisible();
  await expect(page.getByText(/Simulierte Copilot-Antwort/)).toHaveCount(0);
  await expect(page.getByText("Schritt 8 – Plan-Modus auswählen")).toBeVisible();

  await page.getByLabel("Modus").selectOption("plan");
  await expect(page.getByLabel("Modus")).toHaveValue("plan");
  await expect(page.getByText("Schritt 9 – Ask, Plan und Agent einordnen")).toBeVisible();
  await clickCurrentConceptButton(page);

  await expect(page.getByText("Schritt 10 – Ein Modell bewusst auswählen")).toBeVisible();
  await page.getByLabel("Modell").selectOption("gpt-5.3-codex");
  await expect(page.getByLabel("Modell")).toHaveValue("gpt-5.3-codex");
  await expect(page.getByText("Schritt 11 – Auto-Auswahl verwenden")).toBeVisible();
  await page.getByLabel("Modell").selectOption("auto");
  await expect(page.getByLabel("Modell")).toHaveValue("auto");
  await expect(page.getByText("Schritt 12 – Inline-Vorschlag prüfen und annehmen")).toBeVisible();

  const generateSuggestion = page.locator('[data-highlight="copilot.inline.generate"]');
  await expect(generateSuggestion).toBeVisible();
  await generateSuggestion.click();
  await expect(page.locator('[data-highlight="copilot.inline.suggestion"]')).toContainText(
    "return a + b",
  );
  await page.getByRole("button", { name: "Annehmen" }).click();
  await expect(page.locator("textarea")).toHaveValue("def add(a, b):\n    return a + b\n");

  await expect(page.getByText("Schritt 13 – MCP als Erweiterungskonzept verstehen")).toBeVisible();
  await clickCurrentConceptButton(page);
  await expect(page.getByText("Schritt 14 – Agent Skills einordnen")).toBeVisible();
  await clickCurrentConceptButton(page);

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(page.getByText("140", { exact: true })).toBeVisible();
});

test("Einsteiger können Grundbegriffe lesen und direkt im Guide nachschlagen", async ({ page }) => {
  await openCopilotScenario(page);

  await expect(page.getByText("Schritt 1 – Code und Programmierung einordnen")).toBeVisible();
  await expect(page.getByText(/Excel-Formel/)).toBeVisible();
  await expect(page.getByText(/Code funktioniert nach demselben Grundgedanken/)).toBeVisible();

  await completeIntroSteps(page);
  await expect(page.getByText("Schritt 4 – Copilot Chat öffnen")).toBeVisible();

  await page.getByRole("button", { name: "Guide" }).click();
  await expect(page.getByText("Begriffe in diesem Training")).toBeVisible();
  await expect(page.getByText("Code", { exact: true })).toBeVisible();
  await expect(page.getByText("Programmierung", { exact: true })).toBeVisible();
  await expect(page.getByText("Python", { exact: true })).toBeVisible();
  await expect(page.getByText("Workspace", { exact: true })).toBeVisible();
  await expect(page.getByText("Repository", { exact: true })).toBeVisible();
  await expect(page.getByText("Inline-Vorschlag", { exact: true })).toBeVisible();
});

test("Copilot verwirft Inline-Vorschläge bei Datei- oder Quellzustandswechsel", async ({
  page,
}) => {
  await openCopilotScenario(page);
  await completeIntroSteps(page);

  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  await clickCurrentConceptButton(page);
  await page.getByRole("button", { name: "Neue Copilot-Unterhaltung" }).click();
  const prompt = page.getByPlaceholder("Ask Copilot...");
  await prompt.fill("Was macht diese Datei?");
  await prompt.press("Enter");
  await page.getByLabel("Modus").selectOption("plan");
  await clickCurrentConceptButton(page);
  await page.getByLabel("Modell").selectOption("gpt-5.3-codex");
  await page.getByLabel("Modell").selectOption("auto");

  const generateSuggestion = page.locator('[data-highlight="copilot.inline.generate"]');
  await generateSuggestion.click();
  await expect(page.getByRole("button", { name: "Annehmen" })).toBeVisible();

  await page.getByRole("button", { name: "README.md", exact: true }).click();
  await expect(page.getByRole("button", { name: "Annehmen" })).toHaveCount(0);
  await expect(page.locator('[data-highlight="copilot.inline.suggestion"]')).toHaveCount(0);
});

test("Copilot Grundlagen verwendet Modelloptionen aus dem versionierten Produktprofil", async ({
  page,
}) => {
  await openCopilotScenario(page);
  await completeIntroSteps(page);

  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  await clickCurrentConceptButton(page);
  await page.getByRole("button", { name: "Neue Copilot-Unterhaltung" }).click();
  const prompt = page.getByPlaceholder("Ask Copilot...");
  await prompt.fill("Was macht diese Datei?");
  await prompt.press("Enter");
  await page.getByLabel("Modus").selectOption("plan");
  await clickCurrentConceptButton(page);

  const modelSelect = page.getByLabel("Modell");
  await expect(modelSelect.locator("option")).toHaveText([
    "Auto",
    "GPT-5.3-Codex",
    "GPT-5.4",
    "Claude Opus 4.6",
  ]);
});
