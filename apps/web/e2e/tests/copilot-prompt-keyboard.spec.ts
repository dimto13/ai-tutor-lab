import { expect, test, type Page } from "../fixtures/browser-error-guard";

async function openCopilotPrompt(page: Page) {
  await page.goto("/training/copilot-basics.guided");
  await expect(page.getByRole("status").filter({ hasText: "Training bereit" })).toContainText(
    "Training bereit",
  );

  for (let index = 1; index <= 3; index += 1) {
    await page.getByRole("button", { name: "Grundbegriff verstanden" }).click();
  }

  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  await page.getByRole("button", { name: "Kontext hinzufügen" }).click();
  await page.getByRole("button", { name: "Datei anhängen: calculator.py" }).click();

  return page.getByRole("textbox", { name: "Copilot-Prompt" });
}

test(
  "Copilot-Prompt nutzt Shift+Enter für Zeilenumbruch und Enter zum Senden",
  async ({ page }) => {
    const prompt = await openCopilotPrompt(page);
    const response = page.getByText(
      /Für die geforderte Addition muss die Funktion a \+ b zurückgeben/,
    );

    await expect(prompt).toBeVisible();
    await prompt.fill("Erkläre die Addition.");
    await prompt.press("Shift+Enter");
    await prompt.type("Bitte kurz antworten.");

    await expect(prompt).toBeFocused();
    await expect(prompt).toHaveValue("Erkläre die Addition.\nBitte kurz antworten.");
    await expect(response).toHaveCount(0);

    await prompt.press("Enter");

    await expect(prompt).toHaveValue("");
    await expect(response).toBeVisible();
  },
);
