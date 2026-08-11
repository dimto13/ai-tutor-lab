import { expect, test } from "@playwright/test";

test("Guided eskaliert Orientierung zu exakter Aktion und starkem Highlight", async ({ page }) => {
  await page.goto("/training/vscode-basics.guided");
  await expect(page.getByRole("status")).toHaveText("Training bereit");

  await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
  await expect(page.getByRole("heading", { name: "Schritt 7 – Explorer öffnen" })).toBeVisible();

  const spotlight = page.getByTestId("highlight-frame");
  await expect(spotlight).toBeVisible();
  await expect(spotlight).not.toHaveClass(/animate-pulse/);

  await page.getByRole("button", { name: "Hilfe 1 anzeigen" }).click();
  await expect(
    page.getByText("Suche ganz links in der schmalen Activity Bar nach dem Explorer-Symbol."),
  ).toBeVisible();
  await expect(spotlight).not.toHaveClass(/animate-pulse/);

  await page.getByRole("button", { name: "Hilfe 2 anzeigen" }).click();
  await expect(page.getByText("Klicke auf das oberste Symbol mit den zwei Dateien.")).toBeVisible();
  await expect(spotlight).not.toHaveClass(/animate-pulse/);

  await page.getByRole("button", { name: "Hilfe 3 anzeigen" }).click();
  await expect(
    page.getByText("Das Explorer-Symbol wird hervorgehoben. Klicke genau auf dieses Symbol."),
  ).toBeVisible();
  await expect(spotlight).toHaveClass(/animate-pulse/);
});
