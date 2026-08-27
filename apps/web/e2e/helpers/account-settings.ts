import { expect, type Locator, type Page } from "@playwright/test";

// Einstiegspunkt für Kontodaten und Lernpräferenzen. Seit dem Nutzermenü im Plattform-Chrome
// (#232) führt der Weg zweistufig über Trigger und Popover statt über eine einzelne Schaltfläche.
// Lokale und Cloud-Abnahme teilen sich diese Stelle: die lokale Suite läuft in jeder Code CI und
// schlägt bei einer Umbenennung sofort fehl, statt erst beim nächsten manuellen Cloud-Dispatch.

export function accountMenuTrigger(page: Page): Locator {
  return page.getByTestId("account-menu-trigger");
}

export function accountMenu(page: Page): Locator {
  return page.getByTestId("account-menu-popover");
}

export function settingsDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Einstellungen" });
}

export async function openAccountSettings(page: Page): Promise<Locator> {
  await accountMenuTrigger(page).click();
  const menu = accountMenu(page);
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Einstellungen" }).click();
  const dialog = settingsDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

export function settingsCloseButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Einstellungen schließen" });
}

export async function closeAccountSettings(dialog: Locator): Promise<void> {
  await settingsCloseButton(dialog).click();
  await expect(dialog).toBeHidden();
}

export async function signOutFromAccountMenu(page: Page): Promise<void> {
  await accountMenuTrigger(page).click();
  const menu = accountMenu(page);
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Abmelden" }).click();
}
