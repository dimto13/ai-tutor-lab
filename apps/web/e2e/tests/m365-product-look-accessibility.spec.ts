import { expect, test } from "../fixtures/accessibility-regression";

async function waitForTrainingReady(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

test.describe("M365 Copilot product-look accessibility", () => {
  test.describe.configure({ retries: 0 });

  for (const mode of ["explore", "guided", "challenge"] as const) {
    test(`${mode} keeps the light product surface free of unapproved axe violations`, async ({
      page,
      accessibility,
    }) => {
      await page.goto(`/training/m365-copilot-basics.${mode}`);
      await waitForTrainingReady(page);
      await expect(page.locator(".m365-product-ui")).toBeVisible();

      await accessibility.check(`m365-copilot-basics.${mode} light product surface`);
    });
  }
});
