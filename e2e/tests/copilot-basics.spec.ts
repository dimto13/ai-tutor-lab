import { expect, test, type Page } from "@playwright/test";

async function waitUntilReady(page: Page) {
  await expect(page.getByRole("status")).toContainText("Training bereit");
}

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

  await page.goto("/training/copilot-basics.guided");
  await waitUntilReady(page);

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(page.getByText("14 von 14", { exact: true })).toBeVisible();
  await expect(page.getByText("140", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Training erneut starten" }).click();
  await expect(page.getByText("Schritt 1 – Code und Programmierung einordnen")).toBeVisible();
});

test("Copilot Grundlagen ist von Schritt 1 bis 14 vollständig und plausibel durchlaufbar", async ({
  page,
}) => {
  await page.goto("/training/copilot-basics.guided");
  await waitUntilReady(page);

  await expect(page.getByText("Schritt 1 – Code und Programmierung einordnen")).toBeVisible();
  await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
  await expect(page.getByText("Schritt 4 – Copilot Chat öffnen")).toBeVisible();
  await expect(page.getByRole("button", { name: "Konzept verstanden" })).toHaveCount(0);
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const chat = page.locator('[data-highlight="copilot.chat"]');
  await expect(chat).toBeVisible();
  expect(
    await chat.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 50);
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

  await page.getByRole("button", { name: "Konzept verstanden" }).click();
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
  await page.getByRole("button", { name: "Konzept verstanden" }).click();

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
  await page.getByRole("button", { name: "Konzept verstanden" }).click();
  await expect(page.getByText("Schritt 14 – Agent Skills einordnen")).toBeVisible();
  await page.getByRole("button", { name: "Konzept verstanden" }).click();

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(page.getByText("Weiterführende Quellen")).toBeVisible();
  await expect(page.getByRole("link", { name: /Copilot Chat in der IDE/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Agent Skills/ })).toBeVisible();
  await expect(page.getByText(/Ollama/i)).toHaveCount(0);
});

test("Einsteiger können Grundbegriffe lesen und direkt im Guide nachschlagen", async ({ page }) => {
  await page.goto("/training/copilot-basics.guided");
  await waitUntilReady(page);

  await page.getByRole("button", { name: "Code: Begriffserklärung öffnen" }).first().click();
  await expect(page.getByRole("heading", { name: "Code", exact: true })).toBeVisible();
  await expect(page.getByText(/Excel-Formel ist ein vertrautes Beispiel/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Grundbegriff verstanden" }).click();
  await expect(page.getByText("Schritt 2 – Python als Beispielsprache verstehen")).toBeVisible();
  await page.getByRole("button", { name: "Python: Begriffserklärung öffnen" }).first().click();
  await expect(
    page.getByText(
      "Python ist eine Programmiersprache mit vergleichsweise gut lesbaren Regeln. Dateien mit der Endung .py enthalten Python-Code.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Grundbegriff verstanden" }).click();
  await expect(page.getByText("Schritt 3 – Workspace und Repository unterscheiden")).toBeVisible();
  await page.getByRole("button", { name: "Grundbegriff verstanden" }).click();
  await expect(page.getByText("Schritt 4 – Copilot Chat öffnen")).toBeVisible();
});

test("Copilot verwirft Inline-Vorschläge bei Datei- oder Quellzustandswechsel", async ({
  page,
}) => {
  await page.goto("/training/copilot-basics.guided");
  await waitUntilReady(page);

  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const generateSuggestion = page.locator('[data-highlight="copilot.inline.generate"]');
  const inlineSuggestion = page.locator('[data-highlight="copilot.inline.suggestion"]');

  await generateSuggestion.click();
  await expect(inlineSuggestion).toContainText("return a + b");
  await expect(page.getByRole("button", { name: "Annehmen" })).toBeVisible();

  await page.getByRole("button", { name: "README.md", exact: true }).click();
  await expect(page.getByText("Kontext: README.md")).toBeVisible();
  await expect(inlineSuggestion).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Annehmen" })).toHaveCount(0);

  await page.getByRole("button", { name: "calculator.py", exact: true }).first().click();
  await expect(page.getByText("Kontext: calculator.py")).toBeVisible();
  await generateSuggestion.click();
  await expect(inlineSuggestion).toContainText("return a + b");

  const editor = page.locator("textarea");
  await editor.fill("def add(a, b):\n    return a - b\n");
  await page.getByRole("button", { name: "Annehmen" }).click();

  await expect(editor).toHaveValue("def add(a, b):\n    return a - b\n");
  await expect(page.getByRole("button", { name: "Annehmen" })).toHaveCount(0);
});

test("Copilot Grundlagen verwendet Modelloptionen aus dem versionierten Produktprofil", async ({
  page,
}) => {
  await page.goto("/training/copilot-basics.guided");
  await waitUntilReady(page);

  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const modelSelector = page.getByLabel("Modell");
  await expect(modelSelector.locator("option")).toHaveText([
    "Auto",
    "GPT-5.3-Codex",
    "GPT-5.5",
    "Claude Sonnet 4.6",
    "Gemini 3.5 Flash",
  ]);

  const modeSelector = page.getByLabel("Modus");
  await expect(modeSelector.locator("option")).toHaveText(["Ask", "Plan (Preview)", "Agent"]);
});
