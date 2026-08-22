import { expect, test } from "../fixtures/accessibility-regression";

test("Dashboard bietet eigenes Vorhaben als Aktion ohne Trainingsfortschritt an", async ({ page }) => {
  await page.goto("/");

  const card = page
    .getByRole("heading", { name: "Eigenes Vorhaben einordnen" })
    .locator("xpath=ancestor::article");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Aktion · kein Training");
  await expect(card).not.toContainText("In Vorbereitung");
  await expect(card).not.toContainText("abgeschlossen");

  await card.getByRole("link", { name: "Vorhaben einordnen" }).click();
  await expect(page).toHaveURL(/\/einsatzbereiche$/);
});

test("Einsatzbereich liefert drei Ergebnisblöcke, sechs Auftragsfelder und lokale Kopieraktion", async ({
  page,
  accessibility,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/einsatzbereiche");

  await page.getByLabel("Gewünschtes Arbeitsergebnis").fill("Neue Regeln recherchieren und Quellen prüfen");
  await page.getByLabel("Werkzeuge oder Systeme heute").fill("Websuche");
  await page.getByLabel("Wichtige Vorgaben").fill("nur belastbare Quellen");
  await page.getByRole("button", { name: "Vorhaben einordnen" }).click();

  for (const heading of ["Werkzeug-Empfehlung", "Auftragsentwurf", "Vorher klären"]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  for (const field of [
    "Ziel:",
    "Ausgangslage:",
    "Eingaben:",
    "Ergebnisformat:",
    "Randbedingungen:",
    "Prüfkriterium:",
  ]) {
    await expect(page.getByText(field, { exact: false }).first()).toBeVisible();
  }

  await expect(page.getByRole("link", { name: "Mit KI recherchieren – Guided" })).toBeVisible();
  await page.getByRole("button", { name: "Auftrag kopieren" }).click();
  await expect(page.getByRole("button", { name: "Kopiert" })).toBeVisible();
  await accessibility.check("use-case guidance recommendation");
});

test("Einsatzbereich bleibt bei 320px tastaturbedienbar und fragt bei vagem Ziel nach", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/einsatzbereiche");

  const goal = page.getByLabel("Gewünschtes Arbeitsergebnis");
  await goal.focus();
  await page.keyboard.type("Recherche.");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Browser");
  await page.keyboard.press("Tab");
  await page.keyboard.type("intern");
  await page.keyboard.press("Tab");

  await page.getByRole("button", { name: "Vorhaben einordnen" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Noch eine Angabe fehlt" })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
