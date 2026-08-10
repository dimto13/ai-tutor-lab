import { expect, test, type Page } from "@playwright/test";

async function waitUntilReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toContainText("Training bereit");
}

async function runTerminalCommand(page: Page, command: string): Promise<void> {
  const input = page.getByLabel("Terminal-Eingabe");
  await input.fill(command);
  await input.press("Enter");
}

test("Terminal-Simulator führt Datei-, Git- und Python-Befehle zustandsabhängig aus", async ({
  page,
}) => {
  await page.goto("/training/git-basics");
  await waitUntilReady(page);

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await page.getByRole("button", { name: "ai-training-demo", exact: true }).click();
  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.ext").fill("hello.py");
  await page.getByPlaceholder("dateiname.ext").press("Enter");
  await page.getByRole("textbox", { name: "Editor-Inhalt" }).fill('print("Hello AI Training")');
  await page.getByRole("button", { name: "Terminal", exact: true }).last().click();

  await runTerminalCommand(page, "git status");
  await expect(page.getByText("Untracked files:", { exact: true })).toBeVisible();
  await expect(page.getByText("hello.py", { exact: true }).last()).toBeVisible();

  await runTerminalCommand(page, 'git commit -m "too early"');
  await expect(
    page.getByText('nothing added to commit (use "git add" to track files)', { exact: true }),
  ).toBeVisible();

  await runTerminalCommand(page, "git add hello.py");
  await runTerminalCommand(page, 'git commit -m "add hello example"');
  await expect(page.getByText("[main 0000001] add hello example", { exact: true })).toBeVisible();

  await runTerminalCommand(page, "ls");
  await expect(page.getByText(/README\.md.*docs\/.*hello\.py.*src\//)).toBeVisible();

  await runTerminalCommand(page, "python hello.py");
  await expect(page.getByText("Hello AI Training", { exact: true })).toBeVisible();

  await runTerminalCommand(page, "cd src");
  await expect(page.getByText("user@lab:~/ai-training-demo/src$", { exact: true })).toBeVisible();
  await runTerminalCommand(page, "pwd");
  await expect(page.getByText("/home/user/ai-training-demo/src", { exact: true })).toBeVisible();
});
