import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/accessibility-regression";

const CHAT_PROMPT =
  "Fasse die freigegebenen Projektunterlagen für das Team sachlich in einer kurzen Liste zusammen.";

async function activateWithKeyboard(page: Page, target: Locator): Promise<void> {
  await target.focus();
  await expect(target).toBeFocused();
  await page.keyboard.press("Enter");
}

test.describe("M365 Copilot small viewport", () => {
  test.describe.configure({ retries: 0 });

  test("Explore bleibt bei 320 px vollständig erreichbar, zugänglich und ohne horizontalen Overflow", async ({
    page,
    accessibility,
  }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/training/m365-copilot-basics.explore");
    await expect(page.getByRole("status")).toHaveText("Training bereit");

    const navToggle = page.getByRole("button", { name: "Navigation öffnen" });
    const navigation = page.getByRole("navigation", { name: "Copilot Navigation" });

    await expect(navToggle).toBeVisible();
    await expect(navToggle).toHaveAttribute("aria-expanded", "false");
    await expect(navigation).toBeHidden();

    await activateWithKeyboard(page, navToggle);
    await expect(navToggle).toHaveAttribute("aria-expanded", "true");
    await expect(navigation).toBeVisible();
    await expect(page.getByRole("button", { name: "Navigation schließen" })).toBeFocused();

    for (const chrome of ["New chat", "Search", "Library", "Create", "Agents"]) {
      await activateWithKeyboard(page, page.getByRole("button", { name: `${chrome} erkunden` }));
    }

    await accessibility.check("m365-copilot-basics.explore 320px navigation open");

    await page.keyboard.press("Escape");
    await expect(navigation).toBeHidden();
    await expect(navToggle).toBeFocused();
    await expect(navToggle).toHaveAttribute("aria-expanded", "false");

    await activateWithKeyboard(page, page.getByRole("button", { name: "Web", exact: true }));
    await activateWithKeyboard(page, page.getByRole("button", { name: "Work", exact: true }));
    await activateWithKeyboard(page, page.getByRole("button", { name: "Kontext hinzufügen" }));
    await activateWithKeyboard(page, page.getByRole("button", { name: /Vertraulicher Anhang/ }));
    await expect(
      page.getByText("Der vertrauliche Anhang darf nicht an Copilot übergeben werden."),
    ).toBeVisible();
    await activateWithKeyboard(page, page.getByRole("button", { name: /Besprechungsnotiz/ }));

    const composer = page.getByRole("textbox", { name: "Message Copilot" });
    await composer.fill(CHAT_PROMPT);
    await activateWithKeyboard(page, page.getByRole("button", { name: "Nachricht senden" }));
    await expect(page.getByText("Deine Anfrage wurde gesendet.")).toBeVisible();

    await activateWithKeyboard(page, page.getByRole("button", { name: "Verwendete Quellen erkunden" }));
    await activateWithKeyboard(page, page.getByRole("button", { name: /Fakten prüfen/ }));
    await activateWithKeyboard(page, page.getByRole("button", { name: /Unbelegte Aussage verwerfen/ }));
    await activateWithKeyboard(page, page.getByRole("button", { name: "Freigeben", exact: true }));

    await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
    await accessibility.check("m365-copilot-basics.explore 320px completed");

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
