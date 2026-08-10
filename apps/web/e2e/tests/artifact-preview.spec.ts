import { expect, test, type Page } from "@playwright/test";

const scenarioUrl = "/training/artifact-preview-foundation.guided";

async function waitForTrainingReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

test("Artefakt-Vorschau: HTML, Tabelle und strukturierte Daten sind sichtbar und aktionsbasiert prüfbar", async ({
  page,
}) => {
  await page.goto(scenarioUrl);
  await waitForTrainingReady(page);

  await expect(page.getByText("Ergebnis · simuliert", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Status-Tabelle/ }).click();
  await expect(page.getByRole("cell", { name: "Nord", exact: true })).toBeVisible();
  await expect(page.getByTitle("COUNTIF(Status;Offen)").first()).toBeVisible();

  await page.getByRole("button", { name: /Strukturiertes Ergebnis/ }).click();
  await expect(page.getByText(/"nextActions": \[/)).toBeVisible();

  await page.getByRole("button", { name: /Team-Übersicht/ }).click();
  await expectGuidedStep(page, 2, "Vorschau und Quelltext unterscheiden");

  const frame = page.getByTitle("Vorschau: Team-Übersicht");
  await expect(frame).toHaveAttribute("sandbox", "");
  await page.evaluate(() => {
    const target = window as typeof window & { artifactScriptExecuted?: boolean };
    target.artifactScriptExecuted = false;
    window.addEventListener("message", (event) => {
      if (event.data === "artifact-script-executed") target.artifactScriptExecuted = true;
    });
  });
  await frame.evaluate((element) => {
    element.setAttribute(
      "srcdoc",
      "<script>parent.postMessage('artifact-script-executed', '*')</script>",
    );
  });
  await page.waitForTimeout(250);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { artifactScriptExecuted?: boolean }).artifactScriptExecuted,
      ),
    )
    .toBe(false);

  await page.getByRole("button", { name: "Quelltext", exact: true }).click();
  await expectGuidedStep(page, 3, "Deterministische Revision anwenden");
  await expect(page.getByText("<h1>Projektstatus</h1>", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: /Freigabestatus ergänzen/ }).click();
  await expectGuidedStep(page, 4, "Ergebnis aktiv verifizieren");
  await expect(page.getByText("Freigabe bereit", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Artefakt-Vorschau: Revision bleibt nach Reload erhalten", async ({ page }) => {
  await page.goto(scenarioUrl);
  await waitForTrainingReady(page);
  await page.getByRole("button", { name: /Team-Übersicht/ }).click();
  await page.getByRole("button", { name: "Quelltext", exact: true }).click();
  await page.getByRole("button", { name: /Freigabestatus ergänzen/ }).click();
  await expectGuidedStep(page, 4, "Ergebnis aktiv verifizieren");
  await expect(page.getByText("Freigabe bereit", { exact: false })).toBeVisible();

  await page.reload();
  await waitForTrainingReady(page);
  await expectGuidedStep(page, 4, "Ergebnis aktiv verifizieren");
  await expect(page.getByText("Freigabe bereit", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /Freigabestatus ergänzen/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Ergebnis geprüft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});
