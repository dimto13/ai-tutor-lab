import { expect, test, type Locator, type Page } from "../fixtures/browser-error-guard";

const viewports = [
  { name: "landscape-844", width: 844, height: 390 },
  { name: "landscape-932", width: 932, height: 430 },
  { name: "portrait", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 720 },
] as const;

async function expectReachableWithoutScroll(page: Page, control: Locator): Promise<void> {
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) throw new Error("Missing control geometry or viewport");

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

  const unobstructed = await control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit !== null && (element === hit || element.contains(hit));
  });
  expect(unobstructed, "Control must not be covered at its center").toBe(true);
}

for (const viewport of viewports) {
  test(`#574 Tutor and problem entry remain reachable in ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/training/vscode-basics.guided");
    await expect(page.getByRole("status")).toHaveText("Training bereit");

    if (viewport.name !== "desktop") {
      const guide = page.getByRole("button", { name: "Guide anzeigen" });
      await expectReachableWithoutScroll(page, guide);
      await guide.click();
      await expect(page.getByTestId("guided-orientation")).toBeVisible();
    }

    const toggle = page.getByTestId("tutor-chat-toggle");
    await expectReachableWithoutScroll(page, toggle);
    const problem = page.getByRole("button", { name: "Ich habe ein Problem", exact: true });
    await expectReachableWithoutScroll(page, problem);
    await problem.click();
    const dialog = page.getByRole("dialog", { name: "Problem melden" });
    await expect(dialog.getByRole("heading", { name: "Problem melden" })).toBeVisible();
    await dialog
      .getByPlaceholder("Beschreibe kurz das Problem oder deinen Verbesserungsvorschlag.")
      .fill("Synthetischer Landscape-Test: Tutor und Hilfe müssen erreichbar sein.");
    await dialog.getByRole("button", { name: "Problemmeldung senden" }).click();
    await expect(
      dialog.locator('[role="status"], [role="alert"]').filter({
        hasText: /Feedback (?:an die Beta-Inbox gesendet|ist lokal gesichert)/,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Problemmeldung abbrechen" }).click();

    await expectReachableWithoutScroll(page, toggle);
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("tutor-chat-expanded")).toBeVisible();
    const chatInput = page.getByPlaceholder("Frage an den Tutor…");
    await expectReachableWithoutScroll(page, chatInput);
    await expectReachableWithoutScroll(
      page,
      page.getByRole("button", { name: "Senden", exact: true }),
    );
    await chatInput.fill("Wie finde ich den Explorer?");
    await expect(chatInput).toHaveValue("Wie finde ich den Explorer?");
    const close = page.getByTestId("tutor-chat-close");
    await expectReachableWithoutScroll(page, close);
    await close.click();
    await expect(toggle).toBeFocused();

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
}
