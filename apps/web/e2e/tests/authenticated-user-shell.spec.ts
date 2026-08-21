import { expect, test } from "../fixtures/browser-error-guard";

test("authenticated shell exposes a keyboard-safe account menu and persists settings", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("Lokaler Lernender", { exact: true })).toBeVisible();
  await expect(page.getByText("Maria Schmidt", { exact: false })).toHaveCount(0);

  const menuTrigger = page.getByTestId("account-menu-trigger");
  await expect(menuTrigger).toBeVisible();
  await expect(menuTrigger).toHaveAccessibleName("Nutzermenü für Lokaler Lernender öffnen");

  await menuTrigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByTestId("account-menu-popover");
  await expect(menu).toBeVisible();
  await expect(menu.getByText("Mandant: local-tenant", { exact: true })).toBeVisible();
  await expect(menu.getByTestId("account-score-value")).toHaveText("Nicht verfügbar");
  await expect(menu.getByTestId("account-score-visibility")).toHaveText(
    "Lokaler Modus – keine Tenant-Auswertung",
  );
  await expect(menu.getByRole("button", { name: "Einstellungen" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Meine Daten" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Konto löschen" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Abmelden" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(menuTrigger).toBeFocused();

  await menuTrigger.click();
  await menu.getByRole("button", { name: "Einstellungen" }).click();
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  const emailDisplay = dialog.getByTestId("account-email");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Einstellungen schließen" })).toBeFocused();
  await expect(dialog.getByText("Deutsch", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Mandant: local-tenant", { exact: true })).toBeVisible();
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
  await expect(recommendation).toContainText("GitHub Copilot – Grundlagen · Challenge");

  const nameInput = dialog.getByRole("textbox", { name: "Name" });
  await nameInput.fill("Tobias Test");
  await dialog.getByRole("button", { name: "Speichern" }).click();

  await expect(dialog).toBeHidden();
  await expect(menuTrigger).toBeFocused();
  await expect(menuTrigger).toHaveAccessibleName("Nutzermenü für Lokaler Lernender öffnen");

  await page.reload();
  await expect(menuTrigger).toHaveAccessibleName("Nutzermenü für Lokaler Lernender öffnen");

  await menuTrigger.click();
  await menu.getByRole("button", { name: "Einstellungen" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Tobias Test");
  await expect(dialog.getByRole("radio", { name: /Erfahren/ })).toBeChecked();
  await expect(emailDisplay).toContainText("*");
  await expect(emailDisplay).not.toHaveText("learner@local.test");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(menuTrigger).toBeFocused();

  await menuTrigger.click();
  await menu.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/willkommen$/);
});
