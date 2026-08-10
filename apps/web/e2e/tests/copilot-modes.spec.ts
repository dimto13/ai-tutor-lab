import { expect, test } from "@playwright/test";

test("Copilot-Kachel bietet Explore, Guided und Challenge", async ({ page }) => {
  await page.goto("/");
  const heading = page.getByRole("heading", { name: "GitHub Copilot – Grundlagen" });
  await expect(heading).toBeVisible();
  const card = heading.locator("xpath=ancestor::article");
  await expect(card.getByText("AI Coding Assistant · 3 Modi")).toBeVisible();
  await expect(card.getByText("Explore", { exact: true })).toBeVisible();
  await expect(card.getByText("Guided", { exact: true })).toBeVisible();
  await expect(card.getByText("Challenge", { exact: true })).toBeVisible();
});

test("Copilot Explore macht Funktionen und Kontrollpunkte frei untersuchbar", async ({ page }) => {
  await page.goto("/training/copilot-basics.explore");
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const chat = page.locator('[data-highlight="copilot.chat"]');
  await chat.click({ position: { x: 10, y: 10 } });
  await page.getByRole("button", { name: "Neue Copilot-Unterhaltung" }).click();
  await page.locator('[data-highlight="copilot.chat.contextSelector"]').selectOption("none");
  await page.locator('[data-highlight="copilot.chat.contextSelector"]').selectOption("active");
  await page.getByPlaceholder("Ask Copilot...").focus();
  await page.getByLabel("Modus").selectOption("plan");
  await page.getByLabel("Modell").selectOption("gpt-5.3-codex");
  await page.getByRole("button", { name: "Copilot-Aufgabe stoppen" }).click();
  const generate = page.locator('[data-highlight="copilot.inline.generate"]');
  await generate.click();
  const suggestion = page.locator('[data-highlight="copilot.inline.suggestion"]');
  await suggestion.click();
  await page.getByRole("button", { name: "Ablehnen" }).click();
  await generate.click();
  await page.getByRole("button", { name: "Annehmen" }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Copilot Challenge ist über geprüften Inline-Vorschlag lösbar", async ({ page }) => {
  await page.goto("/training/copilot-basics.challenge");
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  await page.locator('[data-highlight="copilot.inline.generate"]').click();
  await expect(page.locator('[data-highlight="copilot.inline.suggestion"]')).toContainText(
    "return a + b",
  );
  await page.getByRole("button", { name: "Annehmen" }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Copilot Challenge ist alternativ über Chat plus eigene geprüfte Änderung lösbar", async ({
  page,
}) => {
  await page.goto("/training/copilot-basics.challenge");
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const prompt = page.getByPlaceholder("Ask Copilot...");
  await prompt.fill("Bitte addiere a und b; nutze nur calculator.py als Kontext.");
  await prompt.press("Enter");
  await page.locator("textarea").fill("def add(a, b):\n    return a + b\n");
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Copilot Challenge akzeptiert keinen Chat-Pfad mit synthetischem Geheimnis im Prompt", async ({
  page,
}) => {
  await page.goto("/training/copilot-basics.challenge");
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const prompt = page.getByPlaceholder("Ask Copilot...");
  await prompt.fill("SYNTHETIC_SECRET=DEMO-ONLY-DO-NOT-SEND; addiere bitte a und b.");
  await prompt.press("Enter");
  await page.locator("textarea").fill("def add(a, b):\n    return a + b\n");
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toHaveCount(0);
  await expect(page.getByText("Endzustand offen")).toBeVisible();
});
