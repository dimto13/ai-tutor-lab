import { expect, test, type Page } from "@playwright/test";

async function waitUntilReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

async function runTerminalCommand(page: Page, command: string): Promise<void> {
  const input = page.getByLabel("Terminal-Eingabe");
  await input.fill(command);
  await input.press("Enter");
}

test("Guided session and VS Code runtime resume exactly after closing and reopening the page", async ({
  page,
  context,
}) => {
  await page.goto("/training/git-basics");
  await waitUntilReady(page);

  await expectGuidedStep(page, 1, "Aktuellen Branch prüfen");
  await runTerminalCommand(page, "git branch --show-current");
  await expectGuidedStep(page, 2, "Working Tree vor der Änderung prüfen");
  await runTerminalCommand(page, "git status");
  await expectGuidedStep(page, 3, "Eigenen Feature-Branch anlegen");
  await runTerminalCommand(page, "git switch -c feature/addition");

  await expectGuidedStep(page, 4, "Copilot Chat öffnen");
  await expect(page.locator('[data-highlight="vscode.statusBar"]')).toContainText(
    "feature/addition",
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.entries(localStorage).some(
          ([key, value]) =>
            key.includes(":runtime:vscode-sim:v3") && value.includes("feature/addition"),
        ),
      ),
    )
    .toBe(true);

  await page.close();
  const resumedPage = await context.newPage();
  await resumedPage.goto("/training/git-basics");
  await waitUntilReady(resumedPage);

  await expectGuidedStep(resumedPage, 4, "Copilot Chat öffnen");
  await expect(resumedPage.locator('[data-highlight="vscode.statusBar"]')).toContainText(
    "feature/addition",
  );
  await expect(
    resumedPage.getByText("Switched to a new branch 'feature/addition'", { exact: true }),
  ).toBeVisible();
});
