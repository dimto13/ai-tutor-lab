import { expect, test } from "../fixtures/browser-error-guard";

test("language switcher applies English immediately and persists across reload", async ({
  page,
}) => {
  await page.goto("/");

  const select = page.getByRole("combobox", { name: "Sprache wechseln" });
  await expect(select).toHaveValue("de");
  await select.selectOption("en");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText("Language", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Change language" })).toHaveValue("en");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText("Language", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Change language" })).toHaveValue("en");
});

test("language switcher is keyboard operable and can return to German", async ({ page }) => {
  await page.goto("/");

  const select = page.getByRole("combobox", { name: "Sprache wechseln" });
  await select.focus();
  await expect(select).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("combobox", { name: "Change language" })).toHaveValue("en");

  const englishSelect = page.getByRole("combobox", { name: "Change language" });
  await englishSelect.focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByText("Sprache", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Sprache wechseln" })).toHaveValue("de");
});

test("language switch during guided training preserves the active step and localizes scenario content", async ({
  page,
}) => {
  await page.goto("/training/vscode-basics.guided");
  await expect(page.getByRole("status").filter({ hasText: "Training bereit" })).toContainText(
    "Training bereit",
  );

  await expect(page.getByText("Visual Studio Code – Grundlagen", { exact: true })).toBeVisible();
  await expect(page.getByText(/Schritt 1 von/)).toBeVisible();

  await page.getByRole("combobox", { name: "Sprache wechseln" }).selectOption("en");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText("Visual Studio Code – Guided Basics", { exact: true })).toBeVisible();
  await expect(page.getByText(/Schritt 1 von/)).toBeVisible();
});
