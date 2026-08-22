import { expect, test } from "../fixtures/browser-error-guard";

test("Sprachwechsel bleibt im Training erreichbar und setzt Fortschritt nicht zurück", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/training/vscode-basics.guided");
  await expect(page.getByRole("status")).toHaveText("Training bereit");

  const initialLanguage = page.getByRole("combobox", { name: /Sprache wechseln|Change language/ });
  await expect(initialLanguage).toBeVisible();
  await initialLanguage.selectOption("de");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");

  await page.getByRole("button", { name: "Guide anzeigen" }).click();
  await expect(
    page.getByRole("heading", { name: "Schritt 1 – Activity Bar einordnen" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
  const currentStep = page.getByRole("heading", { name: "Schritt 7 – Explorer öffnen" });
  await expect(currentStep).toBeVisible();

  const language = page.getByRole("combobox", { name: "Sprache wechseln" });
  await expect(page.getByText("Sprache", { exact: true })).toBeVisible();
  await language.focus();
  await expect(language).toBeFocused();
  await language.selectOption("en");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText("Language", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Change language" })).toHaveValue("en");
  await expect(currentStep).toBeVisible();

  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Training bereit");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText("Language", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Guide anzeigen" }).click();
  await expect(currentStep).toBeVisible();

  await page.getByRole("combobox", { name: "Change language" }).selectOption("de");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
});
