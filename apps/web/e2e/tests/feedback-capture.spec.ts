import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/accessibility-regression";

const FEEDBACK_STORAGE_KEY = "ai-training-lab:feedback:v1";

async function readFeedbackRecords(page: Page): Promise<unknown[]> {
  return page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as unknown[]) : [];
  }, FEEDBACK_STORAGE_KEY);
}

async function prepareScreenshotCaptureCounter(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toDataURL;
    const target = window as Window & { __feedbackScreenshotCaptureCount?: number };
    target.__feedbackScreenshotCaptureCount = 0;
    HTMLCanvasElement.prototype.toDataURL = function toDataURL(type?: string, quality?: number) {
      const current = window as Window & { __feedbackScreenshotCaptureCount?: number };
      current.__feedbackScreenshotCaptureCount = (current.__feedbackScreenshotCaptureCount ?? 0) + 1;
      return original.call(this, type, quality);
    };
  });
}

async function screenshotCaptureCount(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as Window & { __feedbackScreenshotCaptureCount?: number }).__feedbackScreenshotCaptureCount ?? 0,
  );
}

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status").filter({ hasText: "Training bereit" })).toContainText(
    "Training bereit",
  );
}

test("Tutor trennt Lernfrage und explizite Problemmeldung mit strukturiertem Kontext", async ({
  page,
  accessibility,
}) => {
  await prepareScreenshotCaptureCounter(page);
  const forbiddenRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      /(^|\.)github\.com$/i.test(url.hostname) ||
      /(^|\.)githubusercontent\.com$/i.test(url.hostname) ||
      /(^|\/)deploy(?:\/|$)/i.test(url.pathname)
    ) {
      forbiddenRequests.push(url.href);
    }
  });

  await page.goto("/training/vscode-basics.guided");
  await waitForTrainingReady(page);

  const stepHeading = page.locator("aside h2").first();
  const stepBeforeFeedback = await stepHeading.textContent();
  expect(stepBeforeFeedback).toBeTruthy();

  await page.getByRole("button", { name: "Tutor fragen" }).click();
  await page.getByPlaceholder("Frage an den Tutor…").fill("Was ist ein Workspace?");
  await page.getByRole("button", { name: "Senden" }).click();
  await expect(page.getByText("Was ist ein Workspace?", { exact: true })).toBeVisible();
  await expect.poll(async () => (await readFeedbackRecords(page)).length).toBe(0);

  await page.getByRole("button", { name: "Ich habe ein Problem" }).click();
  const dialog = page.getByRole("dialog", { name: "Problem melden" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Lernfragen bleiben normale Tutorfragen");
  await expect(dialog).toContainText("vscode-basics.guided");
  await expect(dialog).toContainText("guided");
  await expect(dialog).toContainText("vscode-simulator");
  expect(await screenshotCaptureCount(page)).toBe(0);

  await dialog
    .getByPlaceholder("Beschreibe kurz das Problem oder deinen Verbesserungsvorschlag.")
    .fill("Beim aktuellen Schritt ist nicht klar, warum der Workspace geöffnet werden soll.");
  await dialog.getByRole("button", { name: "Problemmeldung speichern" }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "Feedback lokal gespeichert. Dein Trainingsfortschritt bleibt unverändert.",
  );

  const records = (await readFeedbackRecords(page)) as Array<{
    source?: string;
    kind?: string;
    text?: string;
    screenshot?: unknown;
    context?: {
      scenarioId?: string;
      stepId?: string | null;
      mode?: string;
      runtimeAdapterId?: string | null;
      runtime?: {
        productId?: string | null;
        capabilities?: string[];
        viewportClass?: string;
        stepStatus?: string | null;
        hintsUsed?: number;
        mistakes?: number;
      } | null;
    };
  }>;

  expect(records).toHaveLength(1);
  expect(records[0]?.source).toBe("tutor");
  expect(records[0]?.kind).toBe("problem");
  expect(records[0]?.text).toContain("Workspace");
  expect(records[0]?.screenshot).toBeUndefined();
  expect(records[0]?.context?.scenarioId).toBe("vscode-basics.guided");
  expect(records[0]?.context?.stepId).toBeTruthy();
  expect(records[0]?.context?.mode).toBe("guided");
  expect(records[0]?.context?.runtimeAdapterId).toBe("vscode-simulator");
  expect(records[0]?.context?.runtime?.productId).toBeTruthy();
  expect(records[0]?.context?.runtime?.capabilities?.length).toBeGreaterThan(0);
  expect(records[0]?.context?.runtime?.stepStatus).toBeTruthy();
  expect(records[0]?.context?.runtime?.hintsUsed).toBe(0);
  expect(records[0]?.context?.runtime?.mistakes).toBe(0);

  expect(await screenshotCaptureCount(page)).toBe(0);
  await expect(stepHeading).toHaveText(stepBeforeFeedback!);
  expect(forbiddenRequests).toEqual([]);
  await accessibility.check("explicit tutor problem feedback confirmation");
});

test("Problemmeldung lässt sich abbrechen, ohne Feedback oder Training-State zu verändern", async ({
  page,
}) => {
  await page.goto("/training/vscode-basics.guided");
  await waitForTrainingReady(page);

  const stepHeading = page.locator("aside h2").first();
  const stepBeforeFeedback = await stepHeading.textContent();
  await page.getByRole("button", { name: "Ich habe ein Problem" }).click();
  const dialog = page.getByRole("dialog", { name: "Problem melden" });
  await dialog
    .getByPlaceholder("Beschreibe kurz das Problem oder deinen Verbesserungsvorschlag.")
    .fill("Diese Meldung soll verworfen werden.");
  await dialog.getByRole("button", { name: "Abbrechen" }).click();

  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await readFeedbackRecords(page)).length).toBe(0);
  await expect(stepHeading).toHaveText(stepBeforeFeedback!);
});

test("Screenshot entsteht erst nach Consent, wird als Vorschau gezeigt und kann verworfen werden", async ({
  page,
}) => {
  await prepareScreenshotCaptureCounter(page);
  await page.goto("/training/vscode-basics.guided");
  await waitForTrainingReady(page);

  await page.getByRole("button", { name: "Ich habe ein Problem" }).click();
  const dialog = page.getByRole("dialog", { name: "Problem melden" });
  await dialog
    .getByPlaceholder("Beschreibe kurz das Problem oder deinen Verbesserungsvorschlag.")
    .fill("Die visuelle Zuordnung im Simulator ist unklar.");

  expect(await screenshotCaptureCount(page)).toBe(0);
  await dialog.getByRole("button", { name: "Screenshot hinzufügen" }).click();
  await expect(dialog).toContainText("Erst dieser Klick startet die Aufnahme");
  expect(await screenshotCaptureCount(page)).toBe(0);

  await dialog.getByRole("button", { name: "Screenshot jetzt aufnehmen" }).click();
  const preview = dialog.getByRole("img", {
    name: "Vorschau des aufgenommenen Trainings-Screenshots",
  });
  await expect(preview).toBeVisible();
  await expect.poll(() => screenshotCaptureCount(page)).toBeGreaterThan(0);

  await dialog.getByRole("button", { name: "Screenshot verwerfen" }).click();
  await expect(preview).toHaveCount(0);
  await dialog.getByRole("button", { name: "Problemmeldung speichern" }).click();

  const records = (await readFeedbackRecords(page)) as Array<{ screenshot?: unknown }>;
  expect(records).toHaveLength(1);
  expect(records[0]?.screenshot).toBeUndefined();
});

test("Problem-Shortcut bleibt bei 320px per Tastatur und Reduced Motion zugänglich", async ({
  page,
  accessibility,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/training/vscode-basics.guided");
  await waitForTrainingReady(page);

  const shortcut = page.getByRole("button", { name: "Ich habe ein Problem" });
  await shortcut.focus();
  await expect(shortcut).toBeFocused();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Problem melden" });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await accessibility.check("beta feedback dialog at 320px reduced-motion");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await readFeedbackRecords(page)).length).toBe(0);
});

test("Feedback bleibt lokal exportierbar und nutzt das bestehende Feedback-Format weiter", async ({
  page,
}) => {
  await page.goto("/training/vscode-basics.guided");
  await waitForTrainingReady(page);

  await page.getByRole("button", { name: "Ich habe ein Problem" }).click();
  const dialog = page.getByRole("dialog", { name: "Problem melden" });
  await dialog
    .getByPlaceholder("Beschreibe kurz das Problem oder deinen Verbesserungsvorschlag.")
    .fill("Die Erklärung zum aktuellen Schritt könnte ein kurzes Beispiel enthalten.");
  await dialog.getByRole("button", { name: "Problemmeldung speichern" }).click();

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "JSON exportieren (1)" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const exported = JSON.parse(await readFile(downloadPath!, "utf8")) as {
    schemaVersion: number;
    feedback: Array<{
      source: string;
      kind: string;
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
  expect(exported.feedback[0]?.kind).toBe("problem");
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
  await waitForTrainingReady(page);
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
