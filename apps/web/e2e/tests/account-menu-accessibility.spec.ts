import { expect, test, type Page } from "../fixtures/accessibility-regression";

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
}

test.describe("account menu accessibility", () => {
  test.describe.configure({ retries: 0 });

  test("user menu is keyboard accessible and contained at 320px", async ({ page, accessibility }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();

    const trigger = page.getByTestId("account-menu-trigger");
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Enter");

    const menu = page.getByTestId("account-menu-popover");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("button", { name: "Einstellungen" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Meine Daten" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Konto löschen" })).toBeVisible();
    await expect(menu.getByRole("button", { name: "Abmelden" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await accessibility.check("account menu at 320px");

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("account deletion entry remains navigation-only", async ({ page, accessibility }) => {
    await page.goto("/");
    const trigger = page.getByTestId("account-menu-trigger");
    await trigger.click();

    const menu = page.getByTestId("account-menu-popover");
    const deletionLink = menu.getByRole("link", { name: "Konto löschen" });
    await expect(deletionLink).toHaveAttribute("href", "/datentransparenz#konto-loeschen");
    await expect(menu.getByRole("button", { name: /Konto löschen/ })).toHaveCount(0);

    await accessibility.check("account menu deletion navigation only");
  });
});
