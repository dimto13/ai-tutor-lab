import { expect, test, type Page } from "@playwright/test";

async function openCopilotScenario(page: Page) {
  await page.goto("/training/copilot-basics.guided");
  await expect(page.getByText("GitHub Copilot – Grundlagen")).toBeVisible();
}

async function completeIntroSteps(page: Page) {
  for (let index = 1; index <= 3; index += 1) {
    await expect(page.getByText(new RegExp(`Schritt ${index} –`))).toBeVisible();
    await page.getByRole("button", { name: "Konzept verstanden" }).click();
  }
}

async function clickCurrentConceptButton(page: Page) {
  await page.getByRole("button", { name: "Konzept verstanden" }).click();
}

test("ein abgeschlossener Legacy-Fortschritt bleibt nach neuen optionalen Schritten abgeschlossen", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "ai-training-lab:copilot-basics.guided:v2",
      JSON.stringify({
        statuses: {
          "open-copilot-chat": "DONE",
          "new-conversation": "DONE",
          "use-file-context": "DONE",
          "select-plan-mode": "DONE",
          "select-model": "DONE",
          "select-auto-model": "DONE",
          "accept-inline-suggestion": "DONE",
          "open-copilot-menu": "DONE",
          "inspect-mcp-entry": "DONE",
          "inspect-agent-skills-entry": "DONE",
        },
        activeStepId: null,
        startedAt: Date.now() - 60_000,
        finishedAt: Date.now() - 1_000,
        hintsUsed: 0,
        mistakes: 0,
        lastAction: "legacy-complete",
      }),
    );
  });

  await openCopilotScenario(page);
  await expect(page.getByText("Training abgeschlossen")).toBeVisible();
  await expect(page.getByText("140 Punkte")).toBeVisible();
  await expect(page.getByRole("button", { name: "Bekannte Grundlagen überspringen" })).toHaveCount(
    0,
  );
});

test("Copilot Grundlagen ist von Schritt 1 bis 14 vollständig und plausibel durchlaufbar", async ({
  page,
}) => {
  await openCopilotScenario(page);

  await completeIntroSteps(page);
  await expect(page.getByText("Schritt 4 – Copilot Chat öffnen")).toBeVisible();

  const chat = page.getByTestId("copilot-chat");
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
    page.getByText(/calculator\.py.*add.*zwei Eingaben.*addieren.*Dateikontext/),
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

  await page.getByRole("button", { name: "Inline-Vorschlag annehmen" }).click();
  await expect(page.getByText(/return a \+ b/)).toBeVisible();
  await expect(page.getByText("Schritt 13 – Copilot-Erweiterungen finden")).toBeVisible();

  await page.getByRole("button", { name: "Copilot-Menü öffnen" }).click();
  await expect(page.getByText("Schritt 14 – MCP und Agent Skills einordnen")).toBeVisible();
  await page.getByRole("button", { name: "MCP-Eintrag" }).click();
  await page.getByRole("button", { name: "Agent Skills-Eintrag" }).click();

  await expect(page.getByText("Training abgeschlossen")).toBeVisible();
  await expect(page.getByText("140 Punkte")).toBeVisible();
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

  await page.getByRole("button", { name: "Copilot" }).click();
  await clickCurrentConceptButton(page);
  await page.getByRole("button", { name: "Neue Copilot-Unterhaltung" }).click();
  const prompt = page.getByPlaceholder("Ask Copilot...");
  await prompt.fill("Was macht diese Datei?");
  await prompt.press("Enter");
  await page.getByLabel("Modus").selectOption("plan");
  await clickCurrentConceptButton(page);
  await page.getByLabel("Modell").selectOption("gpt-5.3-codex");
  await page.getByLabel("Modell").selectOption("auto");

  await expect(page.getByRole("button", { name: "Inline-Vorschlag annehmen" })).toBeVisible();
  await page.getByRole("button", { name: "README.md" }).click();
  await expect(page.getByRole("button", { name: "Inline-Vorschlag annehmen" })).toHaveCount(0);
});

test("Copilot Grundlagen verwendet Modelloptionen aus dem versionierten Produktprofil", async ({
  page,
}) => {
  await openCopilotScenario(page);
  await completeIntroSteps(page);

  await page.getByRole("button", { name: "Copilot" }).click();
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
