import { expect, test } from "../fixtures/browser-error-guard";

test("Copilot-Kachel bietet Explore, Guided und Challenge", async ({ page }) => {
  await page.goto("/");
  const heading = page.getByRole("heading", { name: "GitHub Copilot – Grundlagen" });
  await expect(heading).toBeVisible();
  const card = heading.locator("xpath=ancestor::article");
  await expect(card.getByText("AI Coding Assistant · 3 Modi")).toBeVisible();
  await expect(card.getByRole("link", { name: /Explore/ })).toBeVisible();
  await expect(card.getByRole("link", { name: /Guided/ })).toBeVisible();
  await expect(card.getByRole("link", { name: /Challenge/ })).toBeVisible();
});

test("Copilot Explore macht Funktionen und Kontrollpunkte frei untersuchbar", async ({ page }) => {
  await page.goto("/training/copilot-basics.explore");
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();

  const chat = page.locator('[data-highlight="copilot.chat"]');
  await chat.click({ position: { x: 10, y: 10 } });
  await page.getByRole("button", { name: "Neue Copilot-Unterhaltung" }).click();

  await page.getByRole("button", { name: "Kontext hinzufügen" }).click();
  await page.getByRole("button", { name: "Datei anhängen: calculator.py" }).click();
  await page.locator('[data-highlight="copilot.chat.contextAttachment"]').click();

  const prompt = page.getByRole("textbox", { name: "Copilot-Prompt" });
  await prompt.focus();
  const mode = page.getByLabel("Modus");
  await mode.focus();
  await mode.selectOption("agent");
  const model = page.getByLabel("Modell");
  await model.focus();
  await model.selectOption("gpt-5.3-codex");

  const suggestion = page.locator('[data-highlight="copilot.inline.suggestion"]');
  await expect(suggestion).toContainText("return a + b");
  await suggestion.dispatchEvent("click");

  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.focus();
  await editor.press("Escape");

  await prompt.fill("Bitte korrigiere den Vorschlag auf Addition mit a + b.");
  await prompt.press("Enter");
  await expect(page.locator('[data-highlight="copilot.inline.suggestion"]')).toContainText(
    "return a + b",
  );
  await editor.focus();
  await editor.press("Tab");

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Copilot Challenge ist über geprüften Inline-Vorschlag lösbar", async ({ page }) => {
  await page.goto("/training/copilot-basics.challenge");
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  await expect(page.locator('[data-highlight="copilot.inline.suggestion"]')).toContainText(
    "return a + b",
  );
  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.focus();
  await editor.press("Tab");
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Copilot Challenge ist alternativ über Chat plus eigene geprüfte Änderung lösbar", async ({
  page,
}) => {
  await page.goto("/training/copilot-basics.challenge");
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  await page.getByRole("button", { name: "Kontext hinzufügen" }).click();
  await page.getByRole("button", { name: "Datei anhängen: calculator.py" }).click();
  const prompt = page.getByRole("textbox", { name: "Copilot-Prompt" });
  await prompt.fill("Bitte addiere a und b; nutze nur calculator.py als Kontext.");
  await prompt.press("Enter");
  await page
    .getByRole("textbox", { name: "Editor-Inhalt" })
    .fill("def add(a, b):\n    return a + b\n");
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Copilot Challenge akzeptiert keinen Chat-Pfad mit synthetischem Geheimnis im Prompt", async ({
  page,
}) => {
  await page.goto("/training/copilot-basics.challenge");
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  await page.getByRole("button", { name: "Kontext hinzufügen" }).click();
  await page.getByRole("button", { name: "Datei anhängen: calculator.py" }).click();
  const prompt = page.getByRole("textbox", { name: "Copilot-Prompt" });
  await prompt.fill("SYNTHETIC_SECRET=DEMO-ONLY-DO-NOT-SEND; addiere bitte a und b.");
  await prompt.press("Enter");
  await page
    .getByRole("textbox", { name: "Editor-Inhalt" })
    .fill("def add(a, b):\n    return a + b\n");
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toHaveCount(0);
  await expect(page.getByText("Endzustand offen")).toBeVisible();
});
