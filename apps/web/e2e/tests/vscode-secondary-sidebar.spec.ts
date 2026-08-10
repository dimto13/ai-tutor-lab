import { expect, test, type Page } from "@playwright/test";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function completeCopilotIntroductions(page: Page): Promise<void> {
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole("button", { name: "Grundbegriff verstanden" }).click();
  }
}

test("VS Code modelliert Primary und Secondary Side Bar als getrennte Hosts", async ({ page }) => {
  await page.goto("/training/vscode-basics.explore");
  await waitForTrainingReady(page);

  const primarySideBar = page.locator('[data-highlight="vscode.primarySideBar"]');
  const secondarySideBar = page.locator('[data-highlight="vscode.secondarySideBar"]');

  await expect(primarySideBar).toBeVisible();
  await expect(secondarySideBar).toBeVisible();
  await expect(primarySideBar.locator('[data-highlight="vscode.sideBar"]')).toBeVisible();

  const primaryBox = await primarySideBar.boundingBox();
  const secondaryBox = await secondarySideBar.boundingBox();
  expect(primaryBox).not.toBeNull();
  expect(secondaryBox).not.toBeNull();
  expect(primaryBox!.x).toBeLessThan(secondaryBox!.x);
});

test("Copilot Chat öffnet als View innerhalb der Secondary Side Bar", async ({ page }) => {
  await page.goto("/training/copilot-basics.guided");
  await waitForTrainingReady(page);
  await completeCopilotIntroductions(page);

  const secondarySideBar = page.locator('[data-highlight="vscode.secondarySideBar"]');
  const copilotToggle = secondarySideBar.getByRole("button", { name: "Copilot", exact: true });

  await expect(copilotToggle).toBeVisible();
  await copilotToggle.click();

  const chat = page.locator('[data-highlight="copilot.chat"]');
  await expect(chat).toBeVisible();
  await expect(secondarySideBar).toContainText("GitHub Copilot Chat");
  expect(
    await chat.evaluate(
      (element) => element.closest('[data-highlight="vscode.secondarySideBar"]') !== null,
    ),
  ).toBe(true);
  expect(await chat.evaluate((element) => getComputedStyle(element).position)).not.toBe("absolute");
});
