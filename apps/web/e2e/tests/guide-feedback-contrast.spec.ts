import { expect, test } from "../fixtures/accessibility-regression";

test.describe("Guide feedback contrast", () => {
  test.describe.configure({ retries: 0 });

  test("partial guided progress has no unapproved axe violations", async ({
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

    await expect(
      page.getByText("Die Aktion wurde erkannt, erfüllt aber noch nicht das erwartete Ergebnis."),
    ).toBeVisible();

    await accessibility.check("m365 guided partial-progress feedback");
  });
});
