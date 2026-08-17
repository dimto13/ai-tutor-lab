import { expect, test, type Page } from "../fixtures/browser-error-guard";

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
const localSubject = { userId: "local-learner", tenantId: "local-tenant" } as const;
const guidedStorageKey =
  "ai-training-lab:tenant:value:local-tenant:user:local-learner:copilot-basics.guided:v3";

async function openCopilotScenario(page: Page) {
  await page.goto("/training/copilot-basics.guided");
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await expect(
    page.getByRole("banner").getByText("GitHub Copilot – Grundlagen", { exact: true }),
  ).toBeVisible();
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

async function attachCalculatorContext(page: Page) {
  await page.getByRole("button", { name: "Kontext hinzufügen" }).click();
  await page.getByRole("button", { name: "Datei anhängen: calculator.py" }).click();
  await expect(page.locator('[data-highlight="copilot.chat.contextAttachment"]')).toContainText(
    "calculator.py",
  );
}

async function expectLocalScoreUnavailable(page: Page) {
  const pointsMetric = page.getByText("Punkte", { exact: true }).locator("..");
  await expect(pointsMetric.getByText("—", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Im lokalen Trainingsmodus werden bewusst keine autoritativen Punkte vergeben/),
  ).toBeVisible();
}

test("ein abgeschlossener nutzergebundener Legacy-Fortschritt bleibt nach neuen optionalen Schritten abgeschlossen", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(
    ({ stepIds, key, subject }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          subject,
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
    },
    { stepIds: legacyGuidedStepIds, key: guidedStorageKey, subject: localSubject },
  );

  await openCopilotScenario(page);
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(page.getByText("14 von 14", { exact: true })).toBeVisible();
  await expectLocalScoreUnavailable(page);
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
  await expect(page.getByText(/Dateikontext fügst du jetzt gezielt hinzu/)).toBeVisible();
  await expect(page.getByText("Schritt 7 – Dateikontext bewusst hinzufügen")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Kontext", exact: true })).toHaveCount(0);

  const prompt = page.getByPlaceholder(/Ask Copilot/);
  await attachCalculatorContext(page);
  await prompt.fill("test");
  await prompt.press("Enter");
  await expect(page.getByText("Schritt 7 – Dateikontext bewusst hinzufügen")).toBeVisible();
  await expect(page.getByText(/erwartete Inhalt fehlt noch/)).toBeVisible();

  await prompt.fill("Was macht die aktuell geöffnete Datei?");
  await prompt.press("Enter");
  await expect(
    page.getByText(/Die aktuell geöffnete calculator\.py enthält die Funktionsdefinition/),
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
  await expect(
    page.getByText("Schritt 12 – Unpassenden Vorschlag im Editor erkennen und korrigieren"),
  ).toBeVisible();

  const suggestion = page.locator('[data-highlight="copilot.inline.suggestion"]');
  await expect(suggestion).toContainText("return a - b");
  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.focus();
  await editor.press("Escape");
  await expect(suggestion).toHaveCount(0);

  await prompt.fill("Korrigiere den Vorschlag bitte auf Addition mit a + b.");
  await prompt.press("Enter");
  await expect(
    page.getByText(/Für die geforderte Addition muss die Funktion a \+ b zurückgeben/),
  ).toBeVisible();
  await expect(page.locator('[data-highlight="copilot.inline.suggestion"]')).toContainText(
    "return a + b",
  );
  await editor.focus();
  await editor.press("Tab");
  await expect(editor).toHaveValue("def add(a, b):\n    return a + b\n");

  await expect(page.getByText("Schritt 13 – MCP als Erweiterungskonzept verstehen")).toBeVisible();
  await clickCurrentConceptButton(page);
  await expect(page.getByText("Schritt 14 – Agent Skills einordnen")).toBeVisible();
  await clickCurrentConceptButton(page);

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expectLocalScoreUnavailable(page);
});

test("Einsteiger können Grundbegriffe lesen und direkt im Guide nachschlagen", async ({ page }) => {
  await openCopilotScenario(page);

  await expect(page.getByText("Schritt 1 – Code und Programmierung einordnen")).toBeVisible();
  await page.getByRole("button", { name: "Code: Begriffserklärung öffnen" }).first().click();
  await expect(page.getByRole("heading", { name: "Code", exact: true })).toBeVisible();
  await expect(page.getByText(/Excel-Formel ist ein vertrautes Beispiel/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Grundbegriff verstanden" }).click();
  await expect(page.getByText("Schritt 2 – Python als Beispielsprache verstehen")).toBeVisible();
  await page.getByRole("button", { name: "Python: Begriffserklärung öffnen" }).first().click();
  await expect(page.getByRole("heading", { name: "Python", exact: true })).toBeVisible();
  await expect(page.getByText(/Programmiersprache.*\.py/).first()).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Grundbegriff verstanden" }).click();
  await expect(page.getByText("Schritt 3 – Workspace und Repository unterscheiden")).toBeVisible();
  await page.getByRole("button", { name: "Grundbegriff verstanden" }).click();
  await expect(page.getByText("Schritt 4 – Copilot Chat öffnen")).toBeVisible();
});

test("Copilot verwirft Inline-Vorschläge bei Datei- oder Quellzustandswechsel", async ({
  page,
}) => {
  await openCopilotScenario(page);
  await completeIntroSteps(page);

  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  await clickCurrentConceptButton(page);
  await page.getByRole("button", { name: "Neue Copilot-Unterhaltung" }).click();
  await attachCalculatorContext(page);
  const prompt = page.getByPlaceholder(/Ask Copilot/);
  await prompt.fill("Was macht diese Datei?");
  await prompt.press("Enter");
  await page.getByLabel("Modus").selectOption("plan");
  await clickCurrentConceptButton(page);
  await page.getByLabel("Modell").selectOption("gpt-5.3-codex");
  await page.getByLabel("Modell").selectOption("auto");

  await expect(page.locator('[data-highlight="copilot.inline.suggestion"]')).toContainText(
    "return a - b",
  );
  await page.getByRole("button", { name: "README.md", exact: true }).click();
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
  await attachCalculatorContext(page);
  const prompt = page.getByPlaceholder(/Ask Copilot/);
  await prompt.fill("Was macht diese Datei?");
  await prompt.press("Enter");
  await page.getByLabel("Modus").selectOption("plan");
  await clickCurrentConceptButton(page);

  const modelSelect = page.getByLabel("Modell");
  await expect(modelSelect.locator("option")).toHaveText([
    "Auto",
    "GPT-5.3-Codex",
    "GPT-5.5",
    "Claude Sonnet 4.6",
    "Gemini 3.5 Flash",
  ]);
});
