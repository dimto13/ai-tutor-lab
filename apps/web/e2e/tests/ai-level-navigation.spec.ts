import { expect, test, type Page } from "../fixtures/accessibility-regression";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

test.describe("AI experience level navigation", () => {
  test.describe.configure({ retries: 0 });

  test("shows the effective default and updates all three self-assessment labels without reload", async ({
    page,
  }) => {
    await page.goto("/");

    const levelNavigation = page.getByTestId("ai-level-navigation");
    await expect(levelNavigation).toContainText("KI-Level: Anfänger");
    await expect(levelNavigation).toHaveAccessibleName(
      "Eigene KI-Erfahrung (Selbsteinschätzung): Anfänger. Ändern",
    );

    await levelNavigation.click();
    const dialog = page.getByRole("dialog", { name: "Einstellungen" });
    const beginner = dialog.getByRole("radio", { name: /Anfänger/ });
    await expect(dialog).toBeVisible();
    await expect(beginner).toBeChecked();
    await expect(beginner).toBeFocused();

    await dialog.getByRole("radio", { name: /Fortgeschritten/ }).check();
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(levelNavigation).toContainText("KI-Level: Fortgeschritten");
    await expect(levelNavigation).toHaveAccessibleName(
      "Eigene KI-Erfahrung (Selbsteinschätzung): Fortgeschritten. Ändern",
    );
    await expect(levelNavigation).toBeFocused();

    await levelNavigation.click();
    const intermediate = dialog.getByRole("radio", { name: /Fortgeschritten/ });
    await expect(intermediate).toBeChecked();
    await expect(intermediate).toBeFocused();

    await dialog.getByRole("radio", { name: /Erfahren/ }).check();
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(levelNavigation).toContainText("KI-Level: Erfahren");
    await expect(levelNavigation).toHaveAccessibleName(
      "Eigene KI-Erfahrung (Selbsteinschätzung): Erfahren. Ändern",
    );
    await expect(levelNavigation).toBeFocused();
  });

  test("keeps the level control in platform chrome and keyboard-accessible on a small viewport", async ({
    page,
    accessibility,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/training/vscode-basics.guided");
    await waitForTrainingReady(page);

    const metaNavigation = page.locator('[data-platform-ui="meta-navigation"]');
    const levelNavigation = metaNavigation.getByTestId("ai-level-navigation");
    await expect(levelNavigation).toBeVisible();
    await expect(levelNavigation).toContainText("KI: Anfänger");
    await expect(levelNavigation).toHaveAttribute("data-platform-ui", "ai-level-navigation");
    await expect(levelNavigation).toHaveAccessibleName(
      "Eigene KI-Erfahrung (Selbsteinschätzung): Anfänger. Ändern",
    );

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    await levelNavigation.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Einstellungen" });
    const beginner = dialog.getByRole("radio", { name: /Anfänger/ });
    await expect(dialog).toBeVisible();
    await expect(beginner).toBeChecked();
    await expect(beginner).toBeFocused();

    await accessibility.check("small viewport AI self-assessment settings from platform chrome");
  });
});
