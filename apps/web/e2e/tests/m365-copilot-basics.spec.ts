import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/browser-error-guard";

const CHAT_PROMPT =
  "Fasse die freigegebenen Projektunterlagen für das Team sachlich in einer kurzen Liste zusammen.";

async function waitForTraining(page: Page) {
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await expect(page.getByRole("heading", { name: "Hi, what can I help you with?" })).toBeVisible();
  await expect(
    page.getByText("Simulation mit ausschließlich synthetischen Trainingsdaten"),
  ).toBeVisible();
}

async function openContext(page: Page) {
  await page.getByRole("button", { name: "Kontext hinzufügen" }).click();
  await expect(page.getByRole("button", { name: /Vertraulicher Anhang/ })).toBeVisible();
}

async function attachApprovedSources(page: Page) {
  await openContext(page);
  await page.getByRole("button", { name: /Besprechungsnotiz/ }).click();
  await page.getByRole("button", { name: /Projektsteckbrief/ }).click();
}

async function sendPrompt(page: Page) {
  await page.getByRole("textbox", { name: "Message Copilot" }).fill(CHAT_PROMPT);
  await page.getByRole("button", { name: "Nachricht senden" }).click();
  await expect(page.getByText("Deine Anfrage wurde gesendet.")).toBeVisible();
}

async function reviewAndApprove(page: Page) {
  await page.getByRole("button", { name: /Fakten prüfen/ }).click();
  await page.getByRole("button", { name: /Unbelegte Aussage verwerfen/ }).click();
  await page.getByRole("button", { name: "Freigeben", exact: true }).click();
}

test("Dashboard aktiviert M365 Copilot mit Explore, Guided und Challenge", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("heading", { name: "M365 Copilot Grundlagen" }).locator("..");
  await expect(page.getByRole("heading", { name: "M365 Copilot Grundlagen" })).toBeVisible();
  await expect(page.getByText("Office Assistant · 3 Modi")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Explore.*Chatfläche, Grounding und Kontrollpfad/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Guided.*Work-Kontext → Auftrag → Freigabe/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Challenge.*Freigabefähigen Endzustand/ }),
  ).toBeVisible();
  await expect(card).toBeVisible();
});

test("M365 Copilot Explore vermittelt alle semantischen Kontrollflächen", async ({ page }) => {
  await page.goto("/training/m365-copilot-basics.explore");
  await waitForTraining(page);

  for (const chrome of ["New chat", "Search", "Library", "Create", "Agents"]) {
    await page.getByRole("button", { name: `${chrome} erkunden` }).click();
  }

  await page.getByRole("button", { name: "Web", exact: true }).click();
  await page.getByRole("button", { name: "Work", exact: true }).click();

  await openContext(page);
  await page.getByRole("button", { name: /Vertraulicher Anhang/ }).click();
  await expect(
    page.getByText("Der vertrauliche Anhang darf nicht an Copilot übergeben werden."),
  ).toBeVisible();
  await page.getByRole("button", { name: /Besprechungsnotiz/ }).click();

  await sendPrompt(page);
  await page.getByRole("button", { name: "Verwendete Quellen erkunden" }).click();
  await reviewAndApprove(page);

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("M365 Copilot Guided führt von Work-Grounding bis zur menschlichen Freigabe", async ({
  page,
}) => {
  await page.goto("/training/m365-copilot-basics.guided");
  await waitForTraining(page);

  await page.getByRole("button", { name: "Work", exact: true }).click();
  await attachApprovedSources(page);
  await sendPrompt(page);

  await expect(page.getByText(/Das Budget ist bereits verbindlich freigegeben/)).toBeVisible();
  await page.getByRole("button", { name: /Fakten prüfen/ }).click();
  await page.getByRole("button", { name: /Unbelegte Aussage verwerfen/ }).click();
  await expect(page.getByText(/Das Budget ist bereits verbindlich freigegeben/)).toHaveCount(0);

  await page.getByRole("button", { name: "Freigeben", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("M365 Copilot Challenge bewertet den vollständigen Endzustand ohne echte M365-Daten", async ({
  page,
}) => {
  await page.goto("/training/m365-copilot-basics.challenge");
  await waitForTraining(page);

  await attachApprovedSources(page);
  await page.getByRole("button", { name: /Vertraulicher Anhang/ }).click();
  await expect(
    page.getByText("Der vertrauliche Anhang darf nicht an Copilot übergeben werden."),
  ).toBeVisible();
  await sendPrompt(page);

  const sources = page.locator('[data-runtime-target="m365.result.sources"]');
  await expect(sources).toContainText("Besprechungsnotiz");
  await expect(sources).toContainText("Projektsteckbrief");
  await expect(sources).not.toContainText("Vertraulicher Anhang");

  await reviewAndApprove(page);

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});
