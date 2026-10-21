import { expect, test } from "../../fixtures/browser-error-guard";
import { signOutFromAccountMenu } from "../../helpers/account-settings";
import { documentJourney, expectGuidedStep, waitForTrainingReady } from "./journey-support";

test("[UJ-LOGIN] sign in, sign out and deny protected content", async ({ page }, testInfo) => {
  const runId = documentJourney(testInfo, {
    id: "UJ-LOGIN",
    initialState: "Local adapter starts with its isolated synthetic learner authenticated.",
    successCondition:
      "A form sign-in reaches the dashboard; after sign-out an in-app protected-route attempt is redirected without protected UI.",
  });

  await test.step("establish an anonymous state", async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
    await signOutFromAccountMenu(page);
    await expect(page).toHaveURL(/\/willkommen$/);
    await expect(page.getByRole("heading", { name: "Über KI reden" })).toBeVisible();
  });

  await test.step("sign in through the user-facing form", async () => {
    await page.getByRole("link", { name: "Anmelden" }).click();
    await expect(page).toHaveURL(/\/anmelden$/);
    await page.getByLabel("E-Mail").fill(`${runId}@example.invalid`);
    await page.getByLabel("Passwort").fill("Synthetic-Only-123!");
    await page.getByRole("button", { name: "Anmelden" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();
  });

  await test.step("deny protected content after logout", async () => {
    await signOutFromAccountMenu(page);
    await expect(page).toHaveURL(/\/willkommen$/);

    await page.evaluate(() => {
      window.history.pushState({}, "", "/training/vscode-basics.guided");
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    });

    await expect(page).toHaveURL(/\/willkommen$/);
    await expect(page.getByRole("status").filter({ hasText: "Training bereit" })).toHaveCount(0);
    await expect(page.getByTestId("account-menu-trigger")).toHaveCount(0);
  });
});

test("[UJ-DASHBOARD] find a training and enter its Guided mode", async ({ page }, testInfo) => {
  documentJourney(testInfo, {
    id: "UJ-DASHBOARD",
    initialState: "Authenticated local learner opens a clean dashboard context.",
    successCondition:
      "The requested training exposes every mode and Guided navigation resolves to the matching ready scenario.",
  });

  await test.step("find the requested training and its modes", async () => {
    await page.goto("/");
    await expect(page.locator('[data-dashboard-overview-ready="true"]')).toBeVisible();

    const heading = page.getByRole("heading", {
      name: "Visual Studio Code – Grundlagen",
      exact: true,
    });
    const trainingCard = page.getByRole("article").filter({ has: heading });
    await expect(trainingCard).toHaveCount(1);
    await expect(trainingCard.getByRole("link", { name: /^Explore/ })).toHaveAttribute(
      "href",
      "/training/vscode-basics.explore",
    );
    await expect(trainingCard.getByRole("link", { name: /^Guided/ })).toHaveAttribute(
      "href",
      "/training/vscode-basics.guided",
    );
    await expect(trainingCard.getByRole("link", { name: /^Challenge/ })).toHaveAttribute(
      "href",
      "/training/vscode-basics.challenge",
    );

    await trainingCard.getByRole("link", { name: /^Guided/ }).click();
  });

  await test.step("verify the selected mode and scenario are active", async () => {
    await expect(page).toHaveURL(/\/training\/vscode-basics\.guided$/);
    await waitForTrainingReady(page);
    await expectGuidedStep(page, 1, "Activity Bar einordnen");
    await expect(page.getByText("guided ×1", { exact: true })).toBeVisible();
  });
});
