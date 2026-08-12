import { expect, test } from "@playwright/test";

const landingUrl = "/willkommen";

test.describe("Öffentliche Landingpage", () => {
  test("zeigt die Eröffnungsszene und führt zu Anmeldung oder Registrierung", async ({ page }) => {
    await page.goto(landingUrl);

    await expect(page.getByRole("heading", { name: "Über KI reden" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bedienen wenige." })).toBeVisible();

    const register = page.getByRole("link", { name: "Registrieren" });
    await expect(register).toHaveAttribute("href", "/anmelden?mode=registrieren");

    const signIn = page.getByRole("link", { name: "Anmelden" });
    await expect(signIn).toHaveAttribute("href", "/anmelden");
  });

  test("hält Registrierung und Anmeldung auf schmalen Displays im Viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(landingUrl);

    for (const link of [
      page.getByRole("link", { name: "Registrieren" }),
      page.getByRole("link", { name: "Anmelden" }),
    ]) {
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    }
  });

  test("wechselt über die Abschnittspunkte bis zum Abschluss-Aufruf", async ({ page }) => {
    await page.goto(landingUrl);

    const sections = page.getByRole("navigation", { name: "Abschnitte" });
    const firstSection = sections.getByRole("button", { name: "Abschnitt 1 von 5" });
    const lastSection = sections.getByRole("button", { name: "Abschnitt 5 von 5" });

    await expect(firstSection).toHaveAttribute("aria-current", "true");

    await lastSection.click();
    await expect(lastSection).toHaveAttribute("aria-current", "true");
    await expect(firstSection).not.toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("heading", { name: "kommst du." })).toBeVisible();

    const cta = page.getByRole("link", { name: "Erste Übung starten" });
    await expect(cta).toHaveAttribute("href", "/anmelden");
  });

  test("führt von der Anmeldeseite angemeldet zurück ins Dashboard", async ({ page }) => {
    await page.goto("/anmelden");

    await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
  });
});
