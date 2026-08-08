import { expect, test, type Page } from "@playwright/test";

async function waitUntilReady(page: Page) {
  await expect(page.getByRole("status")).toContainText("Training bereit");
}

test("Copilot Grundlagen erklärt Sessions, Kontext, Modi, Modelle und Erweiterungen", async ({
  page,
}) => {
  await page.goto("/training/copilot-basics.guided");
  await waitUntilReady(page);

  await expect(page.getByText("Schritt 1 – Copilot Chat öffnen")).toBeVisible();
  await expect(page.getByRole("button", { name: "Verstanden – weiter" })).toHaveCount(0);
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  await expect(page.getByText("Schritt 2 – Training-Session und Copilot-Unterhaltung unterscheiden")).toBeVisible();

  await page.getByRole("button", { name: "Verstanden – weiter" }).click();
  await expect(page.getByText("Schritt 3 – Neue Copilot-Unterhaltung beginnen")).toBeVisible();
  await page.getByRole("button", { name: "Neue Copilot-Unterhaltung" }).click();
  await expect(page.getByText(/calculator\.py bleibt als Arbeitskontext erhalten/)).toBeVisible();

  const prompt = page.getByPlaceholder("Ask Copilot...");
  await expect(page.getByText("Kontext: calculator.py")).toBeVisible();
  await prompt.fill("Was macht die aktuell geöffnete Datei?");
  await prompt.press("Enter");
  await expect(page.getByText(/Simulierte Copilot-Antwort mit Kontext calculator\.py/)).toBeVisible();

  await page.getByLabel("Modus").selectOption("plan");
  await expect(page.getByLabel("Modus")).toHaveValue("plan");
  await expect(page.getByText("Schritt 6 – Ask, Plan und Agent einordnen")).toBeVisible();
  await page.getByRole("button", { name: "Verstanden – weiter" }).click();

  await page.getByLabel("Modell").selectOption("gpt-5.3-codex");
  await expect(page.getByLabel("Modell")).toHaveValue("gpt-5.3-codex");
  await page.getByLabel("Modell").selectOption("auto");
  await expect(page.getByLabel("Modell")).toHaveValue("auto");

  await page.getByRole("button", { name: "Vorschlag erzeugen" }).click();
  await expect(page.locator('[data-highlight="copilot.inline.suggestion"]')).toContainText(
    "def add(a, b):",
  );
  await page.getByRole("button", { name: "Annehmen" }).click();
  await expect(page.locator("textarea")).toHaveValue(/def add\(a, b\):/);

  await expect(page.getByText("Schritt 10 – MCP als Erweiterungskonzept verstehen")).toBeVisible();
  await page.getByRole("button", { name: "Verstanden – weiter" }).click();
  await expect(page.getByText("Schritt 11 – Agent Skills einordnen")).toBeVisible();
  await page.getByRole("button", { name: "Verstanden – weiter" }).click();

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(page.getByText("Weiterführende Quellen")).toBeVisible();
  await expect(page.getByRole("link", { name: /Copilot Chat in der IDE/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Agent Skills/ })).toBeVisible();
  await expect(page.getByText(/Ollama/i)).toHaveCount(0);
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
