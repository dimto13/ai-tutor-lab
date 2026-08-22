import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/browser-error-guard";

const promptCriteria = [
  "Ziel klar benannt",
  "freigegebenen Kontext eingegrenzt",
  "Zielgruppe benannt",
  "Ton festgelegt",
  "Ausgabeformat festgelegt",
] as const;

async function waitForTraining(page: Page) {
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await expect(page.getByText("Microsoft 365 Copilot · Simulation")).toBeVisible();
  await expect(page.getByText(/ausschließlich synthetische Trainingsdaten/)).toBeVisible();
}

async function chooseApprovedSources(page: Page) {
  const restricted = page.getByRole("button", { name: "Vertraulicher Anhang freigeben" });
  await expect(restricted).toBeDisabled();
  await page.getByRole("button", { name: "Teams-Besprechungsnotiz freigeben" }).click();
  await page.getByRole("button", { name: "Projektsteckbrief freigeben" }).click();
}

async function submitCompletePrompt(page: Page) {
  for (const criterion of promptCriteria) {
    await page.getByRole("checkbox", { name: criterion }).check();
  }
  await page.getByRole("button", { name: "Arbeitsauftrag an Copilot geben" }).click();
  await expect(page.getByText("Auftrag enthält alle fünf Qualitätsmerkmale.")).toBeVisible();
}

async function createThreeDrafts(page: Page) {
  await page.getByRole("button", { name: "Teams", exact: true }).click();
  await page.getByRole("button", { name: "Teams-Entwurf erzeugen" }).click();
  await page.getByRole("button", { name: "Word", exact: true }).click();
  await page.getByRole("button", { name: "Word-Entwurf erzeugen" }).click();
  await page.getByRole("button", { name: "Outlook", exact: true }).click();
  await page.getByRole("button", { name: "Outlook-Entwurf erzeugen" }).click();
}

test("Dashboard aktiviert M365 Copilot mit Explore, Guided und Challenge", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("heading", { name: "M365 Copilot Grundlagen" }).locator("..");
  await expect(page.getByRole("heading", { name: "M365 Copilot Grundlagen" })).toBeVisible();
  await expect(page.getByText("Office Assistant · 3 Modi")).toBeVisible();
  await expect(page.getByRole("link", { name: /Explore.*Anwendungen und Kontrollpfad/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Guided.*Teams → Word → Outlook/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Challenge.*Freigabefähigen Endzustand/ })).toBeVisible();
  await expect(card).toBeVisible();
});

test("M365 Copilot Explore vermittelt alle semantischen Kontrollflächen", async ({ page }) => {
  await page.goto("/training/m365-copilot-basics.explore");
  await waitForTraining(page);

  for (const label of [
    "Teams erkunden",
    "Word erkunden",
    "Outlook erkunden",
    "Freigegebene Quellen erkunden",
    "Copilot-Arbeitsauftrag erkunden",
    "Copilot-Entwurf erkunden",
    "Faktenprüfung erkunden",
    "Unbelegte Aussage verwerfen erkunden",
    "Freigabeentscheidung erkunden",
  ]) {
    await page.getByRole("button", { name: label }).click();
  }

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("M365 Copilot Guided führt von freigegebenen Teams-Quellen bis zur menschlichen Freigabe", async ({
  page,
}) => {
  await page.goto("/training/m365-copilot-basics.guided");
  await waitForTraining(page);

  await chooseApprovedSources(page);
  await submitCompletePrompt(page);
  await page.getByRole("button", { name: "Teams-Entwurf erzeugen" }).click();
  await page.getByRole("button", { name: "Word", exact: true }).click();
  await page.getByRole("button", { name: "Word-Entwurf erzeugen" }).click();

  await page
    .getByRole("button", { name: "Namen, Zahlen, Zusagen, Quellen und Ton geprüft" })
    .click();
  await page.getByRole("button", { name: "Unbelegte Aussage verwerfen" }).click();
  await expect(page.getByText(/Das Budget ist bereits verbindlich freigegeben/)).toHaveCount(0);

  await page.getByRole("button", { name: "Outlook", exact: true }).click();
  await page.getByRole("button", { name: "Outlook-Entwurf erzeugen" }).click();
  await page.getByRole("button", { name: "Freigeben", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("M365 Copilot Challenge bewertet den vollständigen Endzustand ohne echte M365-Daten", async ({
  page,
}) => {
  await page.goto("/training/m365-copilot-basics.challenge");
  await waitForTraining(page);

  await chooseApprovedSources(page);
  await submitCompletePrompt(page);
  await createThreeDrafts(page);
  await page
    .getByRole("button", { name: "Namen, Zahlen, Zusagen, Quellen und Ton geprüft" })
    .click();
  await page.getByRole("button", { name: "Unbelegte Aussage verwerfen" }).click();
  await page.getByRole("button", { name: "Freigeben", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(page.getByText(/keine Microsoft-365-Verbindung/)).toHaveCount(0);
});
