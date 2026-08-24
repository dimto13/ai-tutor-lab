import { expect, test, type Page } from "../fixtures/browser-error-guard";

async function openCopilotChat(page: Page) {
  await page.goto("/training/git-basics");
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
}

test("Copilot Chat bildet Kopfbereich, Verlauf und produktnahen Composer ab", async ({ page }) => {
  await openCopilotChat(page);

  const chat = page.locator('[data-highlight="copilot.chat"]');
  await expect(chat.getByText("Chat", { exact: true })).toBeVisible();
  await expect(chat.getByText("Sitzungen", { exact: true })).toBeVisible();
  await expect(chat.getByText(/Profil github-copilot-vscode/)).toHaveCount(0);
  await expect(chat.getByRole("button", { name: "Copilot an" })).toHaveCount(0);

  const prompt = chat.getByRole("textbox", { name: "Copilot-Prompt" });
  await expect(prompt).toHaveAttribute("placeholder", "Beschreiben, was erstellt werden soll");

  await expect(chat.locator('[data-highlight="copilot.chat.modeSelector"]')).toBeVisible();
  await expect(chat.locator('[data-highlight="copilot.chat.modelSelector"]')).toBeVisible();
  await expect(chat.getByText("Lokal", { exact: true })).toBeVisible();
  await expect(chat.getByText("Standardgenehmigungen (Sandkasten)", { exact: true })).toBeVisible();

  await prompt.fill("Erkläre die Addition in calculator.py.");
  await prompt.press("Enter");
  await expect(chat.getByText(/add\(a, b\)-Funktion/)).toBeVisible();

  await prompt.fill("Welche Datei ist aktuell im Kontext?");
  await prompt.press("Enter");
  await expect(chat.locator('[data-copilot-message="assistant"]')).toHaveCount(2);
});

test("Copilot Composer behält Kontext und zugängliche Inline-Picker", async ({ page }) => {
  await openCopilotChat(page);

  const chat = page.locator('[data-highlight="copilot.chat"]');
  await chat.getByRole("button", { name: "Kontext hinzufügen" }).click();
  await chat.getByRole("button", { name: "Datei anhängen: calculator.py" }).click();
  await expect(chat.locator('[data-highlight="copilot.chat.contextAttachment"]')).toContainText(
    "calculator.py",
  );

  const mode = chat.locator('[data-highlight="copilot.chat.modeSelector"]');
  const model = chat.locator('[data-highlight="copilot.chat.modelSelector"]');
  await expect(mode).toHaveAccessibleName("Modus");
  await expect(model).toHaveAccessibleName("Modell");

  await mode.selectOption("plan");
  await model.selectOption("auto");
  await expect(mode).toHaveValue("plan");
  await expect(model).toHaveValue("auto");
});
