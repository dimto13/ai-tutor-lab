import { expect, test, type Page } from "../fixtures/browser-error-guard";

// #595: Die Trainingshuelle war `h-screen` hoch und stand unter der Sprachleiste. Das Dokument war
// damit um die Leistenhoehe hoeher als der Viewport, die Statusleiste lag unter dem sichtbaren
// Bereich, und ein Klick nahe dem unteren Rand scrollte das ganze Fenster samt Kopfzeile nach oben.
// Geprueft wird die Passung selbst, nicht eine bestimmte Leistenhoehe: die Leiste darf wachsen.
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1280, height: 900 },
  { width: 1300, height: 620 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
  { width: 320, height: 640 },
] as const;

type Geometry = {
  innerHeight: number;
  scrollHeight: number;
  scrollY: number;
  languageBar: { top: number; bottom: number } | null;
  shell: { top: number; bottom: number } | null;
  statusBar: { top: number; bottom: number } | null;
};

async function readGeometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const verticalBox = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const { top, bottom } = element.getBoundingClientRect();
      return { top, bottom };
    };
    return {
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      scrollY: window.scrollY,
      languageBar: verticalBox('[data-platform-ui="language-switcher"]'),
      shell: verticalBox("[data-viewport-shell]"),
      statusBar: verticalBox('[data-highlight="vscode.statusBar"]'),
    };
  });
}

for (const { width, height } of VIEWPORTS) {
  test(`Trainingsroute füllt bei ${width}x${height} genau den Viewport unter der Sprachleiste`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/training/vscode-basics.guided");
    await expect(page.getByRole("status")).toHaveText("Training bereit");

    const geometry = await readGeometry(page);
    // Die gemessene Geometrie steht in jeder Fehlermeldung, damit ein Fehlschlag ohne weiteren
    // CI-Lauf erklaerbar ist (docs/28-arbeitsbereich-layout.md).
    const measured = JSON.stringify(geometry);

    expect(geometry.scrollHeight, `Dokument steht ueber den Viewport hinaus: ${measured}`).toBe(
      geometry.innerHeight,
    );
    const { languageBar, shell, statusBar } = geometry;
    if (!languageBar || !shell || !statusBar) {
      throw new Error(`Sprachleiste, Huelle oder Statusleiste fehlt: ${measured}`);
    }

    // Die Huelle beginnt direkt unter der Leiste und endet am unteren Viewportrand.
    expect(
      Math.abs(shell.top - languageBar.bottom),
      `Huelle nicht unter der Leiste: ${measured}`,
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(shell.bottom - geometry.innerHeight),
      `Huelle endet nicht am Rand: ${measured}`,
    ).toBeLessThanOrEqual(1);
    expect(
      statusBar.top,
      `Statusleiste oberhalb des Viewports: ${measured}`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      statusBar.bottom,
      `Statusleiste reicht unter den Viewport: ${measured}`,
    ).toBeLessThanOrEqual(geometry.innerHeight + 1);
  });
}

test("Ein Klick unten im Tutor-Chat scrollt das Fenster nicht", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/training/vscode-basics.guided");
  await expect(page.getByRole("status")).toHaveText("Training bereit");

  await page.getByRole("button", { name: "Tutor fragen" }).click();
  await page.getByPlaceholder("Frage an den Tutor…").fill("Was ist ein Workspace?");
  await page.getByRole("button", { name: "Senden" }).click();
  await expect(
    page.getByRole("paragraph").filter({ hasText: /^Was ist ein Workspace\?$/ }),
  ).toBeVisible();

  const geometry = await readGeometry(page);
  const measured = JSON.stringify(geometry);
  expect(geometry.scrollY, `Fenster ist gescrollt: ${measured}`).toBe(0);
  expect(geometry.languageBar?.top, `Sprachleiste nicht am oberen Rand: ${measured}`).toBe(0);
});

async function expectNoOverflow(page: Page): Promise<void> {
  const geometry = await readGeometry(page);
  expect(
    geometry.scrollHeight,
    `Dokument steht ueber den Viewport hinaus: ${JSON.stringify(geometry)}`,
  ).toBe(geometry.innerHeight);
}

test("Challenge-Briefing steht nicht um die Leistenhöhe über den Viewport hinaus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/training/vscode-shortcuts.challenge");
  await expect(page.getByRole("status")).toHaveText("Training bereit");
  await expect(page.locator('[data-platform-ui="challenge-briefing"]')).toBeVisible();

  await expectNoOverflow(page);
});

test("Unbekanntes Training steht nicht um die Leistenhöhe über den Viewport hinaus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  // Clientseitig wie in training-routing.spec.ts: der direkte Aufruf antwortet mit HTTP 404.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
  await page.evaluate(() => {
    window.history.pushState({}, "", "/training/gibt-es-nicht");
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
  });
  await expect(page.getByRole("heading", { name: "Training nicht gefunden" })).toBeVisible();

  await expectNoOverflow(page);
});
