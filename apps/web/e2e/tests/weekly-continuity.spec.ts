import { expect, test } from "../fixtures/accessibility-regression";

test.describe("weekly learning continuity", () => {
  test.describe.configure({ retries: 0 });

  test("shows eight weeks, saves a weekly goal and never presents a streak penalty", async ({
    page,
    accessibility,
  }) => {
    await page.goto("/");

    const card = page.getByTestId("weekly-continuity");
    await expect(card).toBeVisible();
    await expect(card.getByText("Lernkontinuität pro Woche")).toBeVisible();
    await expect(card.getByTestId("weekly-continuity-history").locator("> div")).toHaveCount(8);
    await expect(card).toContainText("Unterbrechungen löschen nichts");
    await expect(card).toContainText("keine Benachrichtigung versendet");

    const goal = card.getByRole("spinbutton", { name: "Wochenziel in Minuten" });
    await goal.fill("90");
    await card.getByRole("button", { name: "Wochenziel speichern" }).click();
    await expect(card).toContainText("0 Min. / 90 Min.");
    await expect(card.getByRole("button", { name: "Wochenziel ändern" })).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("weekly-continuity")).toContainText("0 Min. / 90 Min.");
    await expect(page.getByText(/Streak verloren|Serie verloren|Punkte verloren/i)).toHaveCount(0);

    await accessibility.check("weekly continuity dashboard card");
  });
});
