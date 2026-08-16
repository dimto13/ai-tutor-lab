import { expect, test, type Page } from "@playwright/test";

const guidedUrl = "/training/vscode-basics.guided";

async function ready(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectStep(page: Page, number: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${number} – ${title}` })).toBeVisible();
}

async function reachStepTen(page: Page): Promise<void> {
  await page.goto(guidedUrl);
  await ready(page);
  await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
  await expectStep(page, 7, "Explorer öffnen");
  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expectStep(page, 8, "Einen Ordner als Arbeitskontext öffnen");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /Open Folder\.\.\./ }).click();
  await expectStep(page, 9, "Datei erstellen");
  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.ext").fill("notiz.txt");
  await page.getByPlaceholder("dateiname.ext").press("Enter");
  await expectStep(page, 10, "Datei bearbeiten und speichern");
}

test("replay restores the target runtime and returns to the furthest reached state", async ({
  page,
}) => {
  await reachStepTen(page);
  await expect(
    page.getByRole("button", {
      name: "Trainingsschritt 11 noch nicht erreichbar",
    }),
  ).toBeDisabled();

  await page.getByRole("textbox", { name: "Editor-Inhalt" }).fill("Zwischenstand");
  const replay = page.getByRole("button", { name: "Trainingsschritt 9 wiederholen" });
  await replay.focus();
  await replay.press("Enter");
  await expectStep(page, 9, "Datei erstellen");
  await expect(page.getByRole("button", { name: "notiz.txt", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.ext").fill("notiz.txt");
  await page.getByPlaceholder("dateiname.ext").press("Enter");
  await expectStep(page, 10, "Datei bearbeiten und speichern");
  await expect(page.getByRole("textbox", { name: "Editor-Inhalt" })).toHaveValue("Zwischenstand");

  await page.reload();
  await ready(page);
  await expectStep(page, 10, "Datei bearbeiten und speichern");
  await expect(page.getByRole("textbox", { name: "Editor-Inhalt" })).toHaveValue("Zwischenstand");
});

test("reload during replay keeps replay focus and later reached steps remain selectable", async ({
  page,
}) => {
  await reachStepTen(page);
  await page.getByRole("textbox", { name: "Editor-Inhalt" }).fill("Rückkehrzustand");

  await page.getByRole("button", { name: "Trainingsschritt 7 wiederholen" }).click();
  await expectStep(page, 7, "Explorer öffnen");
  await page.reload();
  await ready(page);
  await expectStep(page, 7, "Explorer öffnen");

  await page.getByRole("button", { name: "Trainingsschritt 9 wiederholen" }).click();
  await expectStep(page, 9, "Datei erstellen");
  await page.getByRole("button", { name: "Zum aktuellen Trainingsschritt 10" }).click();
  await expectStep(page, 10, "Datei bearbeiten und speichern");
  await expect(page.getByRole("textbox", { name: "Editor-Inhalt" })).toHaveValue("Rückkehrzustand");

  await page.reload();
  await ready(page);
  await expectStep(page, 10, "Datei bearbeiten und speichern");
  await expect(page.getByRole("textbox", { name: "Editor-Inhalt" })).toHaveValue("Rückkehrzustand");
});
