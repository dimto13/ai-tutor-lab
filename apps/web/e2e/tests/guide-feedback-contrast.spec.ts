import { expect, test } from "../fixtures/accessibility-regression";

test.describe("Guide feedback contrast", () => {
  test.describe.configure({ retries: 0 });

  test("guided failure feedback has no unapproved axe violations", async ({
    page,
    accessibility,
  }) => {
    await page.goto("/training/m365-copilot-basics.guided");
    await expect(page.getByRole("status")).toHaveText("Training bereit");

    const work = page.getByRole("button", { name: "Work", exact: true });
    await work.click();
    await expect(work).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Kontext hinzufügen" }).click();
    await page.getByRole("button", { name: /Besprechungsnotiz/ }).click();
    // Partial progress is no failure (#591); a prompt without audience is one.
    await expect(page.getByTestId("guided-orientation")).not.toContainText(
      "erfüllt aber noch nicht",
    );
    await page.getByRole("button", { name: /Projektsteckbrief/ }).click();
    await page
      .getByRole("textbox", { name: "Message Copilot" })
      .fill("Fasse die freigegebenen Projektunterlagen kurz als Liste zusammen.");
    await page.getByRole("button", { name: "Nachricht senden" }).click();

    await expect(
      page.getByText("Dein Auftrag sagt noch nicht, für wen die Antwort ist.", { exact: false }),
    ).toBeVisible();

    await accessibility.check("m365 guided failure feedback");
  });
});
