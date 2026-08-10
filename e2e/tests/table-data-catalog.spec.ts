import { expect, test } from "@playwright/test";

test("Tabellendaten-Workflow ist auf der Startseite auffindbar", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByText("Tabellendaten auswerten – Annahmen, Berechnung und Plausibilitätscheck", {
      exact: true,
    }),
  ).toBeVisible();
});
