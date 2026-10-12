import { expect, type Page } from "@playwright/test";

// LL-014 (#558): Seit dem 06.10. endete jeder Cloud-Lauf nur mit „URL bleibt /anmelden“, ohne dass
// das Log sagte, warum. Die Anmeldeseite zeigt eine Ablehnung als role="alert"; dieser Text gehört
// in die Fehlermeldung, damit ein roter Lauf seine Ursache selbst nennt. Er enthält nur die Meldung
// von Cognito oder der App, keine Zugangsdaten.
export async function expectSignedIn(page: Page): Promise<void> {
  try {
    await expect(page).toHaveURL(/\/$/);
  } catch (error) {
    const alerts = (await page.getByRole("alert").allInnerTexts())
      .map((text) => text.trim())
      .filter((text) => text.length > 0);
    throw new Error(
      `Anmeldung nicht abgeschlossen (Seite ${new URL(page.url()).pathname}). Meldung der Anmeldeseite: ${
        alerts.length > 0 ? alerts.join(" | ") : "keine"
      }`,
      { cause: error },
    );
  }
}
