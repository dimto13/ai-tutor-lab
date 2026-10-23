import { expect, test, type Page } from "../../fixtures/browser-error-guard";
import {
  ARTIFACT_GUIDED_STORAGE_KEY,
  ARTIFACT_GUIDED_URL,
  documentJourney,
  expectGuidedStep,
  readLocalSession,
  waitForTrainingReady,
} from "./journey-support";

async function reachArtifactStepTwo(page: Page): Promise<void> {
  await page.goto(ARTIFACT_GUIDED_URL);
  await waitForTrainingReady(page);
  await page.getByRole("button", { name: /Team-Übersicht/ }).click();
  await expectGuidedStep(page, 2, "Vorschau und Quelltext unterscheiden");
}

async function completeArtifactFromStepTwo(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Quelltext", exact: true }).click();
  await expectGuidedStep(page, 3, "Deterministische Revision anwenden");
  await page.getByRole("button", { name: /^Freigabestatus ergänzen/ }).click();
  await expectGuidedStep(page, 4, "Ergebnis aktiv verifizieren");
  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
}

test("[UJ-PERSISTENCE] progress and completion survive local repository reloads", async ({
  page,
}, testInfo) => {
  documentJourney(testInfo, {
    id: "UJ-PERSISTENCE",
    initialState: "Fresh browser context has no artifact-preview Guided session.",
    successCondition:
      "An intermediate step and the final completion reload from the local repository without changing their persisted identity.",
  });

  await test.step("persist and reload intermediate progress", async () => {
    await reachArtifactStepTwo(page);
    await expect
      .poll(async () => (await readLocalSession(page, ARTIFACT_GUIDED_STORAGE_KEY))?.activeStepId)
      .toBe("switch-to-source");
    const beforeReload = await readLocalSession(page, ARTIFACT_GUIDED_STORAGE_KEY);

    await page.reload();
    await waitForTrainingReady(page);
    await expectGuidedStep(page, 2, "Vorschau und Quelltext unterscheiden");

    const afterReload = await readLocalSession(page, ARTIFACT_GUIDED_STORAGE_KEY);
    expect(afterReload?.activeStepId).toBe(beforeReload?.activeStepId);
    expect(afterReload?.revision ?? 0).toBeGreaterThanOrEqual(beforeReload?.revision ?? 0);
    expect(afterReload?.completedSteps).toBe(beforeReload?.completedSteps);
  });

  await test.step("persist and reload completion", async () => {
    await completeArtifactFromStepTwo(page);
    const completed = await readLocalSession(page, ARTIFACT_GUIDED_STORAGE_KEY);
    expect(completed?.finishedAt ?? 0).toBeGreaterThan(0);

    await page.reload();
    await waitForTrainingReady(page);
    await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();

    const restored = await readLocalSession(page, ARTIFACT_GUIDED_STORAGE_KEY);
    expect(restored?.finishedAt).toBe(completed?.finishedAt);
    expect(restored?.revision ?? 0).toBeGreaterThanOrEqual(completed?.revision ?? 0);
    expect(restored?.completedSteps).toBe(completed?.completedSteps);
  });
});

test("[UJ-RECOVERY] already-applied tool state recovers without duplicate completion", async ({
  page,
}, testInfo) => {
  documentJourney(testInfo, {
    id: "UJ-RECOVERY",
    initialState:
      "Synthetic interruption rolls the session back one step while keeping already-applied simulator state.",
    successCondition:
      "Repeated idempotent actions advance the recovered session once; reload does not create a second completion mutation.",
  });

  let sessionAtStepTwo: string | null = null;

  await test.step("simulate an interrupted session with newer tool state", async () => {
    await reachArtifactStepTwo(page);
    sessionAtStepTwo = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      ARTIFACT_GUIDED_STORAGE_KEY,
    );
    expect(sessionAtStepTwo).not.toBeNull();

    await page.getByRole("button", { name: "Quelltext", exact: true }).click();
    await expectGuidedStep(page, 3, "Deterministische Revision anwenden");
    await page.getByRole("button", { name: /^Freigabestatus ergänzen/ }).click();
    await expectGuidedStep(page, 4, "Ergebnis aktiv verifizieren");
    await expect(
      page.locator(
        '[data-highlight="artifact.preview.applyRevision"][data-revision-applied="true"]',
      ),
    ).toBeVisible();

    await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
      key: ARTIFACT_GUIDED_STORAGE_KEY,
      value: sessionAtStepTwo!,
    });
    await page.reload();
    await waitForTrainingReady(page);
    await expectGuidedStep(page, 2, "Vorschau und Quelltext unterscheiden");
  });

  await test.step("repeat idempotent actions and complete once", async () => {
    await completeArtifactFromStepTwo(page);
    const completed = await readLocalSession(page, ARTIFACT_GUIDED_STORAGE_KEY);
    expect(completed?.finishedAt ?? 0).toBeGreaterThan(0);
    expect(completed?.revision ?? 0).toBeGreaterThan(0);

    await page.reload();
    await waitForTrainingReady(page);
    await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();

    const restored = await readLocalSession(page, ARTIFACT_GUIDED_STORAGE_KEY);
    expect(restored?.finishedAt).toBe(completed?.finishedAt);
    expect(restored?.revision ?? 0).toBeGreaterThanOrEqual(completed?.revision ?? 0);
    expect(restored?.completedSteps).toBe(completed?.completedSteps);
  });
});
