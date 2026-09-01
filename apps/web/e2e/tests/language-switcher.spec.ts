import { expect, test } from "../fixtures/browser-error-guard";

test("language switcher applies English immediately and persists across reload", async ({ page }) => {
  await page.goto("/");

  const select = page.getByRole("combobox", { name: "Sprache wechseln" });
  await expect(select).toHaveValue("de");
  await select.selectOption("en");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("combobox", { name: "Change language" })).toHaveValue("en");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("combobox", { name: "Change language" })).toHaveValue("en");
});

test("language switcher is keyboard operable and can return to German", async ({ page }) => {
  await page.goto("/");

  const select = page.getByRole("combobox", { name: "Sprache wechseln" });
  await select.focus();
  await expect(select).toBeFocused();
  await select.selectOption("en");

  const englishSelect = page.getByRole("combobox", { name: "Change language" });
  await englishSelect.selectOption("de");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByRole("combobox", { name: "Sprache wechseln" })).toHaveValue("de");
});
