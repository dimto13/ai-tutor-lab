import { expect, test, type Locator, type Page } from "@playwright/test";

async function waitUntilReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

async function expectSpotlightAround(spotlight: Locator, target: Locator): Promise<void> {
  await expect(spotlight).toBeVisible();
  await expect
    .poll(async () => {
      const [spotlightBox, targetBox, viewport] = await Promise.all([
        spotlight.boundingBox(),
        target.boundingBox(),
        target.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
      ]);
      if (!spotlightBox || !targetBox) return null;

      const padding = 6;
      const viewportInset = 2;
      const expectedLeft = Math.max(viewportInset, targetBox.x - padding);
      const expectedTop = Math.max(viewportInset, targetBox.y - padding);
      const expectedRight = Math.min(
        viewport.width - viewportInset,
        targetBox.x + targetBox.width + padding,
      );
      const expectedBottom = Math.min(
        viewport.height - viewportInset,
        targetBox.y + targetBox.height + padding,
      );

      return {
        top: Math.round(spotlightBox.y - expectedTop),
        right: Math.round(spotlightBox.x + spotlightBox.width - expectedRight),
        bottom: Math.round(spotlightBox.y + spotlightBox.height - expectedBottom),
        left: Math.round(spotlightBox.x - expectedLeft),
      };
    })
    .toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
}

async function runTerminalCommand(page: Page, command: string): Promise<void> {
  const input = page.getByLabel("Terminal-Eingabe");
  await input.fill(command);
  await input.press("Enter");
}

test("Guided: korrekte Teilaktionen lassen das Spotlight nicht auf einem erledigten Ziel hängen", async ({
  page,
}) => {
  await page.goto("/training/git-basics");
  await waitUntilReady(page);

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await page.getByRole("button", { name: "ai-training-demo", exact: true }).click();
  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.ext").fill("hello.py");
  await page.getByPlaceholder("dateiname.ext").press("Enter");

  await expectGuidedStep(page, 4, "Inline-Vorschlag prüfen und übernehmen");
  const spotlight = page.getByTestId("highlight-frame");
  const editorHost = page.locator('[data-highlight="vscode.editor"]');
  await expectSpotlightAround(spotlight, editorHost);

  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.focus();
  await editor.press("Tab");
  await expectGuidedStep(page, 5, "Terminal öffnen");
  await expectSpotlightAround(spotlight, page.locator('[data-highlight="vscode.menu.terminal"]'));

  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  await page
    .getByRole("menuitem", { name: /New Terminal/ })
    .first()
    .click();
  await runTerminalCommand(page, "git status");
  await runTerminalCommand(page, "git add hello.py");
  await runTerminalCommand(page, 'git commit -m "add hello example"');

  await expectGuidedStep(page, 8, "GitHub Copilot einsetzen");
  const secondarySideBar = page.locator('[data-highlight="vscode.secondarySideBar"]');
  await expectSpotlightAround(spotlight, secondarySideBar);

  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  await expectGuidedStep(page, 8, "GitHub Copilot einsetzen");
  await expectSpotlightAround(spotlight, secondarySideBar);

  await page.getByRole("button", { name: "Kontext hinzufügen", exact: true }).click();
  await page.getByRole("button", { name: "Datei anhängen: hello.py", exact: true }).click();
  await expect(page.locator('[data-highlight="copilot.chat.contextAttachment"]')).toContainText(
    "hello.py",
  );
  await expectSpotlightAround(spotlight, secondarySideBar);

  const prompt = page.getByPlaceholder("Ask Copilot...");
  await prompt.fill("Erstelle eine einfache Python-Funktion, die zwei Zahlen addiert.");
  await prompt.press("Enter");

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(spotlight).toHaveCount(0);
});
