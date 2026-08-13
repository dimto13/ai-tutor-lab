import { expect, test } from "@playwright/test";

test("authenticated shell persists account settings and protects the email display", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("Lokaler Lernender", { exact: true })).toBeVisible();
  await expect(page.getByText("Maria Schmidt", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Einstellungen öffnen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abmelden" })).toBeVisible();

  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  const emailDisplay = dialog.getByTestId("account-email");
  await expect(dialog).toBeVisible();
  await expect(emailDisplay).toContainText("@");
  await expect(emailDisplay).toContainText("*");
  await expect(emailDisplay).not.toHaveText("learner@local.test");

  await dialog.getByRole("button", { name: "E-Mail anzeigen" }).click();
  await expect(emailDisplay).toHaveText("learner@local.test");
  await expect(dialog.getByRole("button", { name: "E-Mail verbergen" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await dialog.getByRole("button", { name: "E-Mail verbergen" }).click();
  await expect(emailDisplay).toContainText("*");
  await expect(emailDisplay).not.toHaveText("learner@local.test");

  await dialog.getByRole("radio", { name: /Anfänger/ }).check();
  const recommendation = dialog.getByTestId("ai-level-recommendation");
  await expect(recommendation).toContainText("Visual Studio Code – Grundlagen · Guided");

  await dialog.getByRole("radio", { name: /Erfahren/ }).check();
  await expect(recommendation).toContainText("Mit KI recherchieren und Quellen prüfen · Challenge");

  const nameInput = dialog.getByRole("textbox", { name: "Name" });
  await nameInput.fill("Tobias Test");
  await dialog.getByRole("button", { name: "Speichern" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Tobias Test", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Tobias Test", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio", { name: /Erfahren/ })).toBeChecked();
  await expect(emailDisplay).toContainText("*");
  await expect(emailDisplay).not.toHaveText("learner@local.test");

  await dialog.getByRole("button", { name: "Einstellungen schließen" }).click();
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/willkommen$/);
});
