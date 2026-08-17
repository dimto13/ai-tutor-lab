import { expect, test, type Page } from "../fixtures/browser-error-guard";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

test("Explore: Oberflächenliste ist eine passive, semantische Statusanzeige", async ({ page }) => {
  await page.goto("/training/vscode-basics.explore");
  await waitForTrainingReady(page);

  const hint = page.getByText(
    "Diese Liste zeigt nur deinen Erkundungsfortschritt. Interagiere direkt im Simulator, um weitere Oberflächen zu erkunden.",
    { exact: true },
  );
  await expect(hint).toBeVisible();

  const list = page.getByRole("list", { name: "Oberflächen" });
  await expect(list).toBeVisible();
  const rows = list.getByRole("listitem");
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(0);

  await expect(list.getByRole("button")).toHaveCount(0);
  await expect(list.getByRole("link")).toHaveCount(0);

  const firstRow = rows.first();
  await expect(firstRow).toHaveAttribute("data-explore-status", "open");
  await expect(firstRow).toContainText("Offen");
  expect(await firstRow.getAttribute("tabindex")).toBeNull();
  expect(await firstRow.evaluate((element) => element.tagName)).toBe("LI");
  expect(await firstRow.evaluate((element) => getComputedStyle(element).cursor)).not.toBe(
    "pointer",
  );
  expect((await firstRow.getAttribute("class")) ?? "").not.toContain("hover:");

  await expect(list.locator('[data-explore-status="open"]')).toHaveCount(rowCount);
  await page.getByRole("button", { name: "Explorer", exact: true }).click();

  await expect(list.locator('[data-explore-status="completed"]')).toHaveCount(1);
  await expect(list.locator('[data-explore-status="completed"]')).toContainText("Erledigt");
  await expect(list.locator('[data-explore-status="open"]')).toHaveCount(rowCount - 1);
});

test("Explore: passive Statusanzeige bleibt auf kleinem Viewport vollständig erreichbar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 323, height: 646 });
  await page.goto("/training/vscode-basics.explore");
  await waitForTrainingReady(page);

  await page.getByRole("button", { name: "Guide anzeigen" }).click();

  const hint = page.getByText(/Liste zeigt nur deinen Erkundungsfortschritt/);
  const list = page.getByRole("list", { name: "Oberflächen" });
  await expect(hint).toBeVisible();
  await expect(list).toBeVisible();

  const rows = list.getByRole("listitem");
  const lastRow = rows.last();
  await lastRow.scrollIntoViewIfNeeded();
  await expect(lastRow).toBeVisible();
  await expect(lastRow).toContainText("Offen");

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
