import { readFile } from "node:fs/promises";
import { expect, test } from "../fixtures/browser-error-guard";

test("Feedback speichert Kontext lokal, übersteht Reload und lässt sich als JSON exportieren", async ({
  page,
}) => {
  await page.goto("/training/vscode-basics.guided");
  await expect(page.getByRole("status")).toContainText("Training bereit");

  const stepHeading = page.locator("aside h2").first();
  const stepBeforeFeedback = await stepHeading.textContent();
  expect(stepBeforeFeedback).toBeTruthy();

  await page.getByRole("button", { name: "Feedback geben" }).click();
  const dialog = page.getByRole("dialog", { name: "Feedback geben" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    "keine personenbezogenen, vertraulichen oder geheimen Inhalte",
  );
  await expect(dialog).toContainText("vscode-basics.guided");
  await expect(dialog).toContainText("vscode-simulator");

  await dialog
    .getByPlaceholder("Was war unklar, hilfreich oder sollte verbessert werden?")
    .fill("Die Erklärung zum aktuellen Schritt könnte ein kurzes Beispiel enthalten.");
  await dialog.getByRole("button", { name: "Feedback speichern" }).click();
  await expect(dialog.getByRole("status")).toContainText("Feedback lokal gespeichert");
  await dialog.getByRole("button", { name: "Feedback schließen" }).click();

  await expect(stepHeading).toHaveText(stepBeforeFeedback!);

  await page.reload();
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await page.getByRole("button", { name: "Feedback geben" }).click();
  const reloadedDialog = page.getByRole("dialog", { name: "Feedback geben" });
  await expect(reloadedDialog).not.toContainText(
    "keine personenbezogenen, vertraulichen oder geheimen Inhalte",
  );
  await expect(reloadedDialog.getByRole("button", { name: "JSON exportieren (1)" })).toBeEnabled();

  const downloadPromise = page.waitForEvent("download");
  await reloadedDialog.getByRole("button", { name: "JSON exportieren (1)" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const exported = JSON.parse(await readFile(downloadPath!, "utf8")) as {
    schemaVersion: number;
    feedback: Array<{
      source: string;
      text: string;
      context: {
        scenarioId: string;
        stepId: string | null;
        mode: string;
        runtimeAdapterId: string | null;
        appVersion: string;
        commit: string;
        timestamp: string;
      };
    }>;
  };

  expect(exported.schemaVersion).toBe(1);
  expect(exported.feedback).toHaveLength(1);
  expect(exported.feedback[0]?.source).toBe("tutor");
  expect(exported.feedback[0]?.text).toContain("kurzes Beispiel");
  expect(exported.feedback[0]?.context.scenarioId).toBe("vscode-basics.guided");
  expect(exported.feedback[0]?.context.stepId).toBeTruthy();
  expect(exported.feedback[0]?.context.mode).toBe("guided");
  expect(exported.feedback[0]?.context.runtimeAdapterId).toBe("vscode-simulator");
  expect(exported.feedback[0]?.context.appVersion).toBeTruthy();
  expect(exported.feedback[0]?.context.commit).toBeTruthy();
  expect(Number.isNaN(Date.parse(exported.feedback[0]?.context.timestamp ?? ""))).toBe(false);
});

test("Abschlussansicht bietet optionales Feedback ohne den Abschlusszustand zu verlassen", async ({
  page,
}) => {
  await page.goto("/training/copilot-basics.challenge");
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  await expect(page.locator('[data-highlight="copilot.inline.suggestion"]')).toContainText(
    "return a + b",
  );
  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.focus();
  await editor.press("Tab");

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(page.getByText("War dieses Training verständlich?")).toBeVisible();
  await page.getByRole("button", { name: "Feedback zum Training geben" }).click();
  const dialog = page.getByRole("dialog", { name: "Feedback geben" });
  await dialog
    .getByPlaceholder("Was war unklar, hilfreich oder sollte verbessert werden?")
    .fill("Die Challenge war verständlich.");
  await dialog.getByRole("button", { name: "Feedback speichern" }).click();
  await dialog.getByRole("button", { name: "Feedback schließen" }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});
