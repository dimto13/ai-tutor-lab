import { expect, test } from "../fixtures/browser-error-guard";
import { expectGuidedActionTargetUnobstructed } from "../helpers/guided-overlay-obstruction";

test("NEGATIVNACHWEIS #312: Guard erkennt eine absichtliche visuelle Überdeckung", async ({
  page,
}) => {
  await page.goto("/training/vscode-basics.guided");
  await expect(page.getByRole("status")).toHaveText("Training bereit");

  const tooltip = page.getByTestId("highlight-tooltip");
  await expect(tooltip).toBeVisible();

  await expectGuidedActionTargetUnobstructed(
    page,
    {
      name: "künstliches Guided-Ziel",
      locator: tooltip,
    },
    {
      overlays: [
        {
          name: "künstliches Plattform-Overlay auf derselben Boundingbox",
          locator: tooltip,
        },
      ],
      timeoutMs: 250,
    },
  );
});
