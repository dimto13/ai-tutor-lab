import { expect, test, type Page } from "@playwright/test";

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
      "Explorer geöffnet. Activity Bar und Primary Side Bar haben unterschiedliche Aufgaben; die Secondary Side Bar ist ein separater Bereich für zusätzliche Views.",
    ),
  ).toBeVisible();
});

test("Copilot-Integration nutzt versionierte Modi, Modelle und den aktiven Dateikontext", async ({
  page,
}) => {
  await page.goto("/training/git-basics");
  await waitUntilReady(page);

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await page.getByRole("button", { name: "ai-training-demo", exact: true }).click();
  await page.getByRole("button", { name: "Neue Datei" }).click();
  await page.getByPlaceholder("dateiname.ext").fill("hello.py");
  await page.getByPlaceholder("dateiname.ext").press("Enter");

  const copilotButton = page.getByRole("button", { name: "Copilot", exact: true });
  await expect(copilotButton).toBeVisible();
  await copilotButton.click();

  await expect(page.getByText(/Profil github-copilot-vscode-2026-08 · 2026\.08/)).toBeVisible();
  const contextSelect = page.getByLabel("Kontext");
  await expect(contextSelect).toHaveValue("active");
  await expect(contextSelect.locator("option:checked")).toHaveText("Aktive Datei: hello.py");

  await page.getByLabel("Modus").selectOption("plan");
  await expect(page.getByLabel("Modus")).toHaveValue("plan");
  await page.getByLabel("Modell").selectOption("auto");
  await expect(page.getByLabel("Modell")).toHaveValue("auto");

  const copilotPrompt = page.getByPlaceholder("Ask Copilot...");
  await copilotPrompt.fill("Erkläre den aktiven Dateikontext");
  await copilotPrompt.press("Enter");
  await expect(page.getByText(/hello\.py ist derzeit leer/)).toBeVisible();
  await expect(page.getByText(/Simulierte Copilot-Antwort/)).toHaveCount(0);

  await copilotPrompt.fill("Erstelle eine Python-Funktion zum Addieren zweier Zahlen.");
  await copilotPrompt.press("Enter");
  await expect(page.getByText(/def add\(a, b\):/)).toBeVisible();
  await expect(page.getByText(/return a \+ b/)).toBeVisible();

  await page.getByRole("button", { name: "Vorschlag erzeugen" }).click();
  await expect(page.locator('[data-highlight="copilot.inline.suggestion"]')).toContainText(
    'print("Hello from Copilot")',
  );
  await page.getByRole("button", { name: "Annehmen" }).click();
  await expect(page.locator("textarea")).toHaveValue('print("Hello from Copilot")\n');
});

test("Copilot kann deaktiviert werden, ohne den VS-Code-Simulator zu deaktivieren", async ({
  page,
}) => {
  await page.goto("/training/git-basics");
  await waitUntilReady(page);

  await page.getByRole("button", { name: "Copilot an" }).click();
  await expect(page.getByRole("button", { name: "Copilot", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expect(
    page.getByText("Explorer geöffnet. Jetzt kannst du mit dem vorbereiteten Projekt arbeiten."),
  ).toBeVisible();
});
