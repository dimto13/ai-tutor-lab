import { readFile } from "node:fs/promises";
import { expect, test } from "../fixtures/accessibility-regression";

const ownTrainingKey =
  "ai-training-lab:tenant:value:local-tenant:user:local-learner:vscode-basics.guided:mode:guided:state:v4";
const otherTrainingKey =
  "ai-training-lab:tenant:value:local-tenant:user:other-user:vscode-basics.guided:mode:guided:state:v4";

test("Datentransparenz ist direkt aus dem Account erreichbar und beschreibt die realen Datenklassen", async ({
  page,
  accessibility,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Einstellungen öffnen" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("link", { name: "Diese Daten werden über mich gespeichert" }).click();

  await expect(page).toHaveURL(/\/datentransparenz$/);
  await expect(
    page.getByRole("heading", { name: "Diese Daten werden über mich gespeichert" }),
  ).toBeVisible();
  await expect(page.getByText("Speichermodus: Browser lokal", { exact: true })).toBeVisible();
  await expect(page.getByText("Punkte: Lokaler Modus", { exact: true })).toBeVisible();

  const categories = page.getByTestId("data-transparency-categories");
  for (const name of [
    "Kontoprofil",
    "Lernpräferenzen und Barrierefreiheit",
    "Trainingsfortschritt und Runtime-Zustand",
    "Punkte und Kompetenzprofil",
    "Kompetenznachweise",
    "Nutzungs- und Lerntelemetrie",
    "Produktfeedback",
    "Nur vorübergehend verarbeitete Daten",
  ]) {
    await expect(categories.getByRole("heading", { name })).toBeVisible();
  }

  await expect(categories).toContainText("keine separate automatische Löschfrist");
  await expect(categories).toContainText("Browser-localStorage");
  await expect(categories).toContainText("nicht serverseitig an dein Konto gebunden");
  await accessibility.check("data transparency account route");
});

test("lokaler Eigendatenexport enthält nur subject-gescopte Browserdaten", async ({ page }) => {
  await page.goto("/datentransparenz");
  await expect(
    page.getByRole("heading", { name: "Diese Daten werden über mich gespeichert" }),
  ).toBeVisible();

  await page.evaluate(
    ({ ownKey, otherKey }) => {
      localStorage.setItem(ownKey, JSON.stringify({ marker: "own-training-state" }));
      localStorage.setItem(otherKey, JSON.stringify({ marker: "other-training-state" }));
    },
    { ownKey: ownTrainingKey, otherKey: otherTrainingKey },
  );

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Meine Daten als JSON exportieren" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  if (!downloadPath) throw new Error("Expected own-data export path");

  const exported = JSON.parse(await readFile(downloadPath, "utf8")) as {
    subject: { userId: string; tenantId: string };
    storageMode: string;
    serverData: unknown;
    browserData: {
      scopedTrainingCache: Array<{ key: string; value: { marker?: string } }>;
      feedback: { included: boolean };
    };
    excluded: { authTokens: string; tenantAggregates: string };
  };

  expect(exported.subject).toEqual({ userId: "local-learner", tenantId: "local-tenant" });
  expect(exported.storageMode).toBe("browser-local");
  expect(exported.serverData).toBeNull();
  expect(exported.browserData.scopedTrainingCache).toEqual([
    { key: ownTrainingKey, value: { marker: "own-training-state" } },
  ]);
  expect(exported.browserData.feedback.included).toBe(false);
  expect(JSON.stringify(exported)).not.toContain("other-training-state");
  expect(exported.excluded.authTokens).toContain("never exported");
  expect(exported.excluded.tenantAggregates).toContain("not person-specific");
  await expect(page.getByRole("status")).toContainText("Eigendatenexport wurde als JSON-Datei erstellt");
});

test("Datentransparenz bleibt bei 320px tastatur- und screenreader-tauglich", async ({
  page,
  accessibility,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/datentransparenz");

  const exportButton = page.getByRole("button", { name: "Meine Daten als JSON exportieren" });
  await exportButton.focus();
  await expect(exportButton).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await accessibility.check("data transparency at 320px reduced-motion");
});
