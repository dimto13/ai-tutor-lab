import { expect, test } from "../fixtures/browser-error-guard";

test("negative proof: uncaught pageerror fails the test", async ({ page }) => {
  await page.goto("/willkommen");
  await expect(page).toHaveURL(/\/willkommen$/);

  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error("E2E_NEGATIVE_PAGEERROR_PROOF");
    }, 0);
  });
  await page.waitForTimeout(100);
});

test("negative proof: internal console.error fails the test", async ({ page }) => {
  await page.goto("/willkommen");
  await expect(page).toHaveURL(/\/willkommen$/);

  await page.evaluate(() => {
    console.error("E2E_NEGATIVE_CONSOLE_ERROR_PROOF");
  });
});
