import { expect, test, type Page } from "../fixtures/browser-error-guard";

const vscodeGuidedUrl = "/training/vscode-basics.guided";
const claudeGuidedUrl = "/training/claude-code-basics.guided";

async function ready(page: Page): Promise<void> {
  await expect(page.locator('p[role="status"]').filter({ hasText: "Training bereit" })).toHaveText(
    "Training bereit",
  );
}

async function expectStep(page: Page, number: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${number} – ${title}` })).toBeVisible();
}

async function skipVscodeIntroductions(page: Page): Promise<void> {
  await page.goto(vscodeGuidedUrl);
  await ready(page);
  await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
  await expectStep(page, 7, "Explorer öffnen");
}

async function reachVscodeStepTen(page: Page): Promise<void> {
  await skipVscodeIntroductions(page);
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

test("Tutor meta navigation follows #231 replay and attention stays temporary", async ({
  page,
}) => {
  await reachVscodeStepTen(page);

  const meta = page.getByTestId("tutor-meta-layer");
  await expect(meta).toContainText("Tutor-Ebene · Lernplattform");
  await expect(meta).toContainText("Schritt 10 · Datei bearbeiten und speichern");

  await meta.getByRole("button", { name: "Tutorführung zurück" }).click();
  await expectStep(page, 9, "Datei erstellen");
  await expect(meta).toContainText("Schritt 9 · Datei erstellen");

  const guidedHighlight = page.locator('[data-highlight-kind="guided"]');
  await expect(guidedHighlight).toBeVisible();

  await meta.getByRole("button", { name: "Im Werkzeug zeigen" }).click();
  const tutorAttention = page.getByTestId("tutor-attention-frame");
  await expect(tutorAttention).toBeVisible();
  await expect(tutorAttention).toHaveAttribute("data-attention-kind", "tutor");
  await expect(tutorAttention).toHaveAttribute("data-attention-targets", "vscode.explorer.newFile");
  await expect(guidedHighlight).toBeVisible();

  await expect(tutorAttention).toHaveCount(0, { timeout: 4000 });
  await expect(guidedHighlight).toBeVisible();

  await meta.getByRole("button", { name: "Tutorführung weiter" }).click();
  await expectStep(page, 10, "Datei bearbeiten und speichern");
  await expect(meta).toContainText("Schritt 10 · Datei bearbeiten und speichern");
});

test("Tutor attention resolves Claude Code targets through the same adapter contract", async ({
  page,
}) => {
  await page.goto(claudeGuidedUrl);
  await ready(page);

  const meta = page.getByTestId("tutor-meta-layer");
  await expect(meta).toContainText("Schritt 1 · Sitzung und Wirkungsbereich einordnen");
  await meta.getByRole("button", { name: "Im Werkzeug zeigen" }).click();

  const tutorAttention = page.getByTestId("tutor-attention-frame");
  await expect(tutorAttention).toBeVisible();
  await expect(tutorAttention).toHaveAttribute("data-attention-targets", "claude.session.header");
});

test("Tutor attention disables animation when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await skipVscodeIntroductions(page);

  const meta = page.getByTestId("tutor-meta-layer");
  await meta.getByRole("button", { name: "Im Werkzeug zeigen" }).click();

  const tutorAttention = page.getByTestId("tutor-attention-frame");
  await expect(tutorAttention).toBeVisible();
  await expect
    .poll(() =>
      tutorAttention.evaluate((element) => window.getComputedStyle(element).animationName),
    )
    .toBe("none");
});
