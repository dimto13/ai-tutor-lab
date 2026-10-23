import { expect, test } from "../../fixtures/browser-error-guard";
import {
  VSCODE_CHALLENGE_STORAGE_KEY,
  VSCODE_EXPLORE_STORAGE_KEY,
  VSCODE_GUIDED_STORAGE_KEY,
  VSCODE_GUIDED_URL,
  completeVscodeGuidedFromEditor,
  createVscodeFile,
  documentJourney,
  expectGuidedStep,
  readLocalSession,
  waitForTrainingReady,
} from "./journey-support";

test("[UJ-GUIDED] complete a reload-safe Guided training through real actions", async ({
  page,
}, testInfo) => {
  documentJourney(testInfo, {
    id: "UJ-GUIDED",
    initialState: "Fresh browser context has no local session for vscode-basics.guided.",
    successCondition:
      "Two tool actions persist, reload resumes the exact step, completion is repository-backed, and local score unavailability is explicit.",
  });

  await test.step("perform two domain actions and persist the next step", async () => {
    await page.goto(VSCODE_GUIDED_URL);
    await waitForTrainingReady(page);
    await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
    await expectGuidedStep(page, 7, "Explorer öffnen");

    await page.getByRole("button", { name: "Explorer", exact: true }).click();
    await expectGuidedStep(page, 8, "Einen Ordner als Arbeitskontext öffnen");
    await page.getByRole("button", { name: "File", exact: true }).click();
    await page.getByRole("menuitem", { name: /Open Folder\.\.\./ }).click();
    await expectGuidedStep(page, 9, "Datei erstellen");

    await expect
      .poll(async () => (await readLocalSession(page, VSCODE_GUIDED_STORAGE_KEY))?.activeStepId)
      .toBe("create_file");
  });

  await test.step("reload and resume from the repository-backed step", async () => {
    const beforeReload = await readLocalSession(page, VSCODE_GUIDED_STORAGE_KEY);
    expect(beforeReload?.revision ?? 0).toBeGreaterThan(0);

    await page.reload();
    await waitForTrainingReady(page);
    await expectGuidedStep(page, 9, "Datei erstellen");

    const afterReload = await readLocalSession(page, VSCODE_GUIDED_STORAGE_KEY);
    expect(afterReload?.activeStepId).toBe("create_file");
    expect(afterReload?.completedSteps ?? 0).toBeGreaterThanOrEqual(8);
  });

  await test.step("finish the training and verify the local repository outcome", async () => {
    await createVscodeFile(page, "notiz.txt");
    await expectGuidedStep(page, 10, "Datei bearbeiten und speichern");
    await completeVscodeGuidedFromEditor(page);

    await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
    await expect
      .poll(async () => (await readLocalSession(page, VSCODE_GUIDED_STORAGE_KEY))?.finishedAt ?? 0)
      .toBeGreaterThan(0);

    const pointsMetric = page.getByText("Punkte", { exact: true }).locator("..");
    await expect(pointsMetric.getByText("—", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Im lokalen Trainingsmodus werden bewusst keine autoritativen Punkte vergeben.",
        { exact: true },
      ),
    ).toBeVisible();
  });
});

test("[UJ-EXPLORE] inspected surfaces remain completed after reload", async ({
  page,
}, testInfo) => {
  documentJourney(testInfo, {
    id: "UJ-EXPLORE",
    initialState: "Fresh local Explore session starts with zero inspected surfaces.",
    successCondition:
      "A real simulator inspection changes both UI progress and the local session, and reload preserves both.",
  });

  await test.step("inspect a real simulator surface", async () => {
    await page.goto("/training/vscode-basics.explore");
    await waitForTrainingReady(page);
    await expect(page.getByText("0 von 23 Oberflächen untersucht", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Explorer", exact: true }).click();

    await expect(page.getByText("1 von 23 Oberflächen untersucht", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/Der Explorer zeigt Dateien und Ordner deines aktuellen Arbeitskontexts\./),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (await readLocalSession(page, VSCODE_EXPLORE_STORAGE_KEY))?.exploredTargets.length ?? 0,
      )
      .toBe(1);
  });

  await test.step("reload and verify the same persisted progress", async () => {
    await page.reload();
    await waitForTrainingReady(page);

    await expect(page.getByText("1 von 23 Oberflächen untersucht", { exact: true })).toBeVisible();
    const surfaceList = page.getByRole("list", { name: "Oberflächen" });
    await expect(surfaceList.locator('[data-explore-status="completed"]')).toHaveCount(1);
    expect(
      (await readLocalSession(page, VSCODE_EXPLORE_STORAGE_KEY))?.exploredTargets,
    ).toHaveLength(1);
  });
});

test("[UJ-CHALLENGE] only the complete saved end state succeeds", async ({ page }, testInfo) => {
  documentJourney(testInfo, {
    id: "UJ-CHALLENGE",
    initialState: "Fresh Challenge session has no challenge.txt and an open end state.",
    successCondition:
      "A saved incomplete file stays unsuccessful; only the exact saved target state completes and persists.",
  });

  await test.step("save an incomplete solution and verify rejection", async () => {
    await page.goto("/training/vscode-basics.challenge");
    await waitForTrainingReady(page);
    await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Explorer", exact: true }).click();
    await page.getByRole("button", { name: "ai-training-demo", exact: true }).click();
    await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
    await page.getByPlaceholder("dateiname.ext").fill("challenge.txt");
    await page.getByPlaceholder("dateiname.ext").press("Enter");

    const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
    await editor.fill("noch unvollständig");
    await editor.press("Control+s");

    await expect(page.getByText("Endzustand offen", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toHaveCount(0);
    expect((await readLocalSession(page, VSCODE_CHALLENGE_STORAGE_KEY))?.finishedAt).toBeNull();
  });

  await test.step("save the required end state and verify persisted completion", async () => {
    const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
    await editor.fill("VS Code Grundlagen abgeschlossen");
    await editor.press("Control+s");

    await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
    await expect
      .poll(
        async () => (await readLocalSession(page, VSCODE_CHALLENGE_STORAGE_KEY))?.finishedAt ?? 0,
      )
      .toBeGreaterThan(0);
  });
});
