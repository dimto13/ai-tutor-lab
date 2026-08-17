import { expect, test, type Locator, type Page } from "../fixtures/browser-error-guard";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function cssVariable(locator: Locator, name: string): Promise<string> {
  return locator.evaluate(
    (element, variableName) => getComputedStyle(element).getPropertyValue(variableName).trim(),
    name,
  );
}

async function expectPlatformSeparatedFromRuntime(
  page: Page,
  runtimeProbe: Locator,
): Promise<void> {
  const guide = page.locator('[data-platform-ui="guide"]');
  await expect(guide).toBeVisible();
  await expect(runtimeProbe).toBeVisible();

  const [platformAccent, declaredPlatformAccent, runtimeAccent, platformPanel, runtimePanel] =
    await Promise.all([
      cssVariable(guide, "--accent"),
      cssVariable(guide, "--platform-accent"),
      cssVariable(runtimeProbe, "--accent"),
      cssVariable(guide, "--panel"),
      cssVariable(runtimeProbe, "--panel"),
    ]);

  expect(platformAccent).toBe(declaredPlatformAccent);
  expect(runtimeAccent).not.toBe(declaredPlatformAccent);
  expect(platformPanel).not.toBe(runtimePanel);
}

test("VS Code: Explore, Guided und Challenge trennen Plattform- und Simulator-Tokens", async ({
  page,
}) => {
  for (const mode of ["explore", "guided", "challenge"] as const) {
    await page.goto(`/training/vscode-basics.${mode}`);
    await waitForTrainingReady(page);

    await expectPlatformSeparatedFromRuntime(
      page,
      page.locator('[data-highlight="vscode.primarySideBar"]'),
    );

    const metaNavigation = page.locator('[data-platform-ui="meta-navigation"]');
    await expect(metaNavigation).toBeVisible();
    expect(await cssVariable(metaNavigation, "--accent")).toBe(
      await cssVariable(metaNavigation, "--platform-accent"),
    );
  }
});

test("Claude Code: dieselbe Plattform-Ebene bleibt vom CLI-RuntimeAdapter getrennt", async ({
  page,
}) => {
  await page.goto("/training/claude-code-basics.guided");
  await waitForTrainingReady(page);

  await expectPlatformSeparatedFromRuntime(
    page,
    page.getByRole("textbox", { name: "Eingabezeile" }),
  );
});

test("kleiner Viewport: Guide bleibt erreichbar, differenziert und ohne horizontales Overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/training/vscode-basics.guided");
  await waitForTrainingReady(page);

  const metaNavigation = page.locator('[data-platform-ui="meta-navigation"]');
  await expect(metaNavigation).toBeVisible();
  expect(await cssVariable(metaNavigation, "--accent")).toBe(
    await cssVariable(metaNavigation, "--platform-accent"),
  );

  await page.getByRole("button", { name: "Guide anzeigen" }).click();
  const guide = page.locator('[data-platform-ui="guide"]');
  await expect(guide).toBeVisible();
  await expect(page.getByRole("button", { name: "Tutor fragen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Senden" })).toHaveCount(0);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
