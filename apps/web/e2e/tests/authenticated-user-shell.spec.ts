import { expect, test } from "@playwright/test";

test("authenticated shell shows real identity, persists display name and logs out", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Lokaler Lernender", { exact: true })).toBeVisible();
  await expect(page.getByText("Maria Schmidt", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Einstellungen öffnen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abmelden" })).toBeVisible();

  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("learner@local.test", { exact: true })).toBeVisible();

  const nameInput = dialog.getByRole("textbox", { name: "Name" });
  await nameInput.fill("Tobias Test");
  await dialog.getByRole("button", { name: "Speichern" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Tobias Test", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Tobias Test", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/willkommen$/);
});
