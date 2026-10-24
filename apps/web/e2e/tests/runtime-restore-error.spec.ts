import { expect, test, type Page } from "../fixtures/browser-error-guard";

const scenarioUrl = "/training/artifact-preview-foundation.guided";
const runtimeStorageSuffix = ":runtime:artifact-preview-simulator:v3";

type StoredProgress = {
  activeStepId: string | null;
  finishedAt: number | null;
  startedAt: number;
  statuses: Record<string, string>;
};

async function readStoredProgress(page: Page): Promise<StoredProgress | null> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (candidate) =>
        candidate.includes("artifact-preview-foundation") &&
        candidate.endsWith(":mode:guided:state:v4"),
    );
    if (!key) return null;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw).value as StoredProgress) : null;
  });
}

async function advanceToVerification(page: Page): Promise<StoredProgress> {
  await page.goto(scenarioUrl);
  await expect(page.getByRole("status")).toHaveText("Training bereit");
  await page.getByRole("button", { name: /Team-Übersicht/ }).click();
  await page.getByRole("button", { name: "Quelltext", exact: true }).click();
  await page.getByRole("button", { name: /Freigabestatus ergänzen/ }).click();
  await expect(
    page.getByRole("heading", { name: "Schritt 4 – Ergebnis aktiv verifizieren" }),
  ).toBeVisible();

  await expect
    .poll(async () => {
      const progress = await readStoredProgress(page);
      return progress
        ? Object.values(progress.statuses).filter((status) => status === "COMPLETED").length
        : 0;
    })
    .toBe(3);

  const progress = await readStoredProgress(page);
  if (!progress) throw new Error("Guided session was not persisted");
  expect(progress.finishedAt).toBeNull();
  return progress;
}

test("#606: a runtime read failure preserves started Guided progress and reports recovery", async ({
  page,
}) => {
  const before = await advanceToVerification(page);
  await expect
    .poll(() =>
      page.evaluate(
        (suffix) => Object.keys(localStorage).some((key) => key.endsWith(suffix)),
        runtimeStorageSuffix,
      ),
    )
    .toBe(true);

  // Inject a storage read failure only for the runtime snapshot, not the session.
  // A rejected/exhausted coordinator read must not be interpreted as missing state.
  await page.addInitScript((suffix) => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string): string | null {
      if (key.endsWith(suffix)) {
        const state = window as typeof window & { runtimeRestoreReadFailures?: number };
        state.runtimeRestoreReadFailures = (state.runtimeRestoreReadFailures ?? 0) + 1;
        throw new Error("Injected runtime snapshot read failure (#606)");
      }
      return originalGetItem.call(this, key);
    };
  }, runtimeStorageSuffix);

  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Training bereit");
  await expect(
    page.getByRole("heading", { name: "Schritt 4 – Ergebnis aktiv verifizieren" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Der gespeicherte Arbeitsstand konnte nicht geladen werden. Dein Lernfortschritt bleibt erhalten. Lade die Seite erneut, um es noch einmal zu versuchen.",
      { exact: true },
    ),
  ).toBeVisible();

  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { runtimeRestoreReadFailures?: number })
          .runtimeRestoreReadFailures,
    ),
  ).toBeGreaterThan(0);

  const after = await readStoredProgress(page);
  expect(after).not.toBeNull();
  expect(after?.startedAt).toBe(before.startedAt);
  expect(after?.activeStepId).toBe(before.activeStepId);
  expect(after?.statuses).toEqual(before.statuses);
  expect(after?.finishedAt).toBe(before.finishedAt);
});

test("#606: a genuinely missing runtime snapshot still resets inconsistent Guided progress", async ({
  page,
}) => {
  const before = await advanceToVerification(page);
  await expect
    .poll(() =>
      page.evaluate(
        (suffix) => Object.keys(localStorage).some((key) => key.endsWith(suffix)),
        runtimeStorageSuffix,
      ),
    )
    .toBe(true);

  await page.evaluate((suffix) => {
    const key = Object.keys(localStorage).find((candidate) => candidate.endsWith(suffix));
    if (!key) throw new Error("Expected saved runtime snapshot");
    localStorage.removeItem(key);
  }, runtimeStorageSuffix);

  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Training bereit");
  await expect(
    page.getByRole("heading", { name: "Schritt 1 – HTML-Artefakt auswählen" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await readStoredProgress(page))?.activeStepId ?? null)
    .not.toBe(before.activeStepId);
  expect((await readStoredProgress(page))?.finishedAt).toBeNull();
});

async function navigateInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

async function interruptHydrationOnSessionRead(page: Page, destination: string): Promise<void> {
  await page.addInitScript((nextPath) => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string): string | null {
      const value = originalGetItem.call(this, key);
      const state = window as typeof window & { hydrationInterruptionTriggered?: boolean };
      if (
        !state.hydrationInterruptionTriggered &&
        key.includes("artifact-preview-foundation") &&
        key.endsWith(":mode:guided:state:v4")
      ) {
        // Trigger a real React Router scope change *inside* the session read,
        // before its async hydration continuation can finish.
        state.hydrationInterruptionTriggered = true;
        window.history.pushState({}, "", nextPath);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
      return value;
    };
  }, destination);
}

test("#606: switching scenarios during hydration cannot rewind the previous Guided attempt", async ({
  page,
}) => {
  const before = await advanceToVerification(page);
  await interruptHydrationOnSessionRead(page, "/training/git-basics");
  await page.reload();

  await expect(page).toHaveURL(/\/training\/git-basics$/);
  await expect(page.getByRole("heading", { name: "Schritt 1 – Aktuellen Branch prüfen" })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { hydrationInterruptionTriggered?: boolean })
          .hydrationInterruptionTriggered,
    ),
  ).toBe(true);

  await navigateInApp(page, scenarioUrl);
  await expect(
    page.getByRole("heading", { name: "Schritt 4 – Ergebnis aktiv verifizieren" }),
  ).toBeVisible();
  const after = await readStoredProgress(page);
  expect(after?.startedAt).toBe(before.startedAt);
  expect(after?.activeStepId).toBe(before.activeStepId);
  expect(after?.statuses).toEqual(before.statuses);
  expect(after?.finishedAt).toBe(before.finishedAt);
});

test("#606: unmount during hydration preserves the saved Guided attempt for remount", async ({
  page,
}) => {
  const before = await advanceToVerification(page);
  await interruptHydrationOnSessionRead(page, "/");
  await page.reload();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Schritt 4 – Ergebnis aktiv verifizieren" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { hydrationInterruptionTriggered?: boolean })
          .hydrationInterruptionTriggered,
    ),
  ).toBe(true);

  await navigateInApp(page, scenarioUrl);
  await expect(
    page.getByRole("heading", { name: "Schritt 4 – Ergebnis aktiv verifizieren" }),
  ).toBeVisible();
  const after = await readStoredProgress(page);
  expect(after?.startedAt).toBe(before.startedAt);
  expect(after?.activeStepId).toBe(before.activeStepId);
  expect(after?.statuses).toEqual(before.statuses);
  expect(after?.finishedAt).toBe(before.finishedAt);
});
