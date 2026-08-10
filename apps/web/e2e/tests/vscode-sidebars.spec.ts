import { expect, test, type Page } from "@playwright/test";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

test(
  "VS Code Explore exposes the Primary Side Bar as its own semantic surface",
  async ({ page }) => {
    await page.goto("/training/vscode-basics.explore");
    await waitForTrainingReady(page);

    const primarySideBar = page.locator('[data-highlight="vscode.primarySideBar"]');
    await expect(primarySideBar).toBeVisible();
    await primarySideBar.click({ position: { x: 8, y: 48 } });

    await expect(page.getByText("1 von 21 Oberflächen untersucht", { exact: true })).toBeVisible();
  },
);

test(
  "Copilot Chat is a View in the Secondary Side Bar instead of an editor popup",
  async ({ page }) => {
    await page.goto("/training/copilot-basics.guided");
    await waitForTrainingReady(page);

    for (let index = 0; index < 3; index += 1) {
      await page.getByRole("button", { name: "Grundbegriff verstanden" }).click();
    }

    const primarySideBar = page.locator('[data-highlight="vscode.primarySideBar"]');
    const secondarySideBar = page.locator('[data-highlight="vscode.secondarySideBar"]');
    const editor = page.locator('[data-highlight="vscode.editor"]');

    await expect(primarySideBar).toBeVisible();
    await expect(secondarySideBar).toBeVisible();
    await expect(page.getByText("Schritt 4 – Copilot Chat öffnen")).toBeVisible();

    await page.getByRole("button", { name: "Copilot", exact: true }).click();

    const chat = page.locator('[data-highlight="copilot.chat"]');
    await expect(chat).toBeVisible();
    await expect(secondarySideBar.locator('[data-highlight="copilot.chat"]')).toBeVisible();
    await expect(
      page.getByText("Schritt 5 – Training-Session und Copilot-Unterhaltung unterscheiden"),
    ).toBeVisible();

    const [primaryBox, editorBox, secondaryBox] = await Promise.all([
      primarySideBar.boundingBox(),
      editor.boundingBox(),
      secondarySideBar.boundingBox(),
    ]);
    expect(primaryBox).not.toBeNull();
    expect(editorBox).not.toBeNull();
    expect(secondaryBox).not.toBeNull();
    expect(primaryBox!.x + primaryBox!.width).toBeLessThanOrEqual(editorBox!.x + 1);
    expect(editorBox!.x + editorBox!.width).toBeLessThanOrEqual(secondaryBox!.x + 1);

    await page.setViewportSize({ width: 323, height: 646 });
    const narrowSecondaryBox = await secondarySideBar.boundingBox();
    expect(narrowSecondaryBox).not.toBeNull();
    expect(narrowSecondaryBox!.x).toBeGreaterThanOrEqual(0);
    expect(narrowSecondaryBox!.x + narrowSecondaryBox!.width).toBeLessThanOrEqual(323);
  },
);
