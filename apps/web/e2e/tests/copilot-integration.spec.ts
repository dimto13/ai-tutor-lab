import { expect, test, type Page } from "../fixtures/browser-error-guard";

async function waitUntilReady(page: Page) {
  await expect(page.getByRole("status")).toContainText("Training bereit");
}

test("VS Code Grundlagen bleibt ohne Copilot-Integration lauffähig", async ({ page }) => {
  await page.goto("/training/vscode-basics.guided");
  await waitUntilReady(page);

  await expect(page.getByRole("button", { name: "Copilot", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expect(
    page.getByText(
      "Explorer geöffnet. Activity Bar und Primary Side Bar haben unterschiedliche Aufgaben; die Secondary Side Bar ist ein eigener zusätzlicher Bereich.",
    ),
  ).toBeVisible();
});

test("Copilot-Integration nutzt versionierte Modi, Modelle und gezielt angehängten Dateikontext", async ({
  page,
}) => {
  await page.goto("/training/git-basics");
  await waitUntilReady(page);

  const copilotButton = page.getByRole("button", { name: "Copilot", exact: true });
  await expect(copilotButton).toBeVisible();
  await copilotButton.click();

  await expect(page.getByRole("combobox", { name: "Kontext", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Kontext hinzufügen" }).click();
  await page.getByRole("button", { name: "Datei anhängen: calculator.py" }).click();
  await expect(page.locator('[data-highlight="copilot.chat.contextAttachment"]')).toContainText(
    "calculator.py",
  );

  await page.getByLabel("Modus").selectOption("plan");
  await expect(page.getByLabel("Modus")).toHaveValue("plan");
  await page.getByLabel("Modell").selectOption("auto");
  await expect(page.getByLabel("Modell")).toHaveValue("auto");

  const copilotPrompt = page.getByRole("textbox", { name: "Copilot-Prompt" });
  await copilotPrompt.fill(
    "Erkläre die Addition in calculator.py und halte notes.txt aus dem Commit.",
  );
  await copilotPrompt.press("Enter");
  await expect(page.getByText(/add\(a, b\)-Funktion/)).toBeVisible();
  await expect(page.getByText(/notes\.txt.*aus.*Commit.*heraus/)).toBeVisible();
  await expect(page.getByText(/Simulierte Copilot-Antwort/)).toHaveCount(0);

  await expect(page.locator('[data-highlight="copilot.inline.suggestion"]')).toContainText(
    "return a + b",
  );
  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.focus();
  await editor.press("Tab");
  await expect(editor).toHaveValue(/return a \+ b/);
  await expect(editor).toHaveValue(/CHECK: addition ready/);
});
