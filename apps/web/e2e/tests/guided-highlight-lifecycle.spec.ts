import { expect, test, type Locator, type Page } from "@playwright/test";

async function waitUntilReady(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toHaveText("Training bereit");
}

async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `Schritt ${step} – ${title}` })).toBeVisible();
}

async function expectSpotlightAround(spotlight: Locator, target: Locator): Promise<void> {
  await expect(spotlight).toBeVisible();
  await expect
    .poll(async () => {
      const [spotlightBox, targetBox, viewport] = await Promise.all([
        spotlight.boundingBox(),
        target.boundingBox(),
        target.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
      ]);
      if (!spotlightBox || !targetBox) return null;

      const padding = 6;
      const viewportInset = 2;
      const expectedLeft = Math.max(viewportInset, targetBox.x - padding);
      const expectedTop = Math.max(viewportInset, targetBox.y - padding);
      const expectedRight = Math.min(
        viewport.width - viewportInset,
        targetBox.x + targetBox.width + padding,
      );
      const expectedBottom = Math.min(
        viewport.height - viewportInset,
        targetBox.y + targetBox.height + padding,
      );

      return {
        top: Math.round(spotlightBox.y - expectedTop),
        right: Math.round(spotlightBox.x + spotlightBox.width - expectedRight),
        bottom: Math.round(spotlightBox.y + spotlightBox.height - expectedBottom),
        left: Math.round(spotlightBox.x - expectedLeft),
      };
    })
    .toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
}

async function runTerminalCommand(page: Page, ...parts: string[]): Promise<void> {
  const input = page.getByLabel("Terminal-Eingabe");
  await input.fill(parts.join(" "));
  await input.press("Enter");
}

test("Workflow-Kachel bietet Explore, Guided und Challenge mit sichtbaren Voraussetzungen", async ({
  page,
}) => {
  await page.goto("/");
  const heading = page.getByRole("heading", {
    name: "VS Code, Git & GitHub Copilot – Zusammenspiel",
  });
  await expect(heading).toBeVisible();
  const card = heading.locator("xpath=ancestor::article");
  await expect(card.getByText("Workflow · 3 Modi")).toBeVisible();
  await expect(card.getByText(/Voraussetzung.*VS Code.*Git.*GitHub Copilot/)).toBeVisible();
  await expect(card.getByRole("link", { name: /Explore/ })).toBeVisible();
  await expect(card.getByRole("link", { name: /Guided/ })).toBeVisible();
  await expect(card.getByRole("link", { name: /Challenge/ })).toBeVisible();
});

test("Explore: integrierte Umgebung bleibt frei erkundbar und zeigt keine Guided-Navigation", async ({
  page,
}) => {
  await page.goto("/training/developer-workflow-basics.explore");
  await waitUntilReady(page);
  await expect(
    page
      .getByText("VS Code, Git & GitHub Copilot – Zusammenspiel erkunden", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(page.locator('[data-highlight="vscode.editor"]')).toBeVisible();
  await expect(page.locator('[data-highlight="vscode.statusBar"]')).toContainText("main");
  await page.getByRole("button", { name: "Source Control", exact: true }).click();
  await expect(page.getByText("M notes.txt", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Weiter/i })).toHaveCount(0);
});

test("Guided: Spotlight folgt dem integrierten Workflow bis zum handoff-ready Zustand", async ({
  page,
}) => {
  await page.goto("/training/git-basics");
  await waitUntilReady(page);

  const spotlight = page.getByTestId("highlight-frame");
  const terminalInput = page.locator('[data-highlight="vscode.panel.terminal.input"]');
  const editorHost = page.locator('[data-highlight="vscode.editor"]');

  await expectGuidedStep(page, 1, "Aktuellen Branch prüfen");
  await expectSpotlightAround(spotlight, terminalInput);
  await runTerminalCommand(page, "git", "branch", "--show-current");

  await expectGuidedStep(page, 2, "Working Tree vor der Änderung prüfen");
  await runTerminalCommand(page, "git", "status");
  await expect(page.getByText("notes.txt", { exact: false }).last()).toBeVisible();

  await expectGuidedStep(page, 3, "Eigenen Feature-Branch anlegen");
  await runTerminalCommand(page, "git", "switch", "-c", "feature/addition");
  await expect(page.locator('[data-highlight="vscode.statusBar"]')).toContainText(
    "feature/addition",
  );

  await expectGuidedStep(page, 4, "Copilot Chat öffnen");
  const chatToggle = page.locator('[data-highlight="copilot.chat.toggle"]');
  await expectSpotlightAround(spotlight, chatToggle);
  await page.getByRole("button", { name: "Copilot", exact: true }).click();

  await expectGuidedStep(page, 5, "Relevante Datei als Kontext anhängen");
  const addContext = page.locator('[data-highlight="copilot.chat.addContext"]');
  await expectSpotlightAround(spotlight, addContext);
  await page.getByRole("button", { name: "Kontext hinzufügen", exact: true }).click();
  await page.getByRole("button", { name: "Datei anhängen: calculator.py", exact: true }).click();
  await expect(page.locator('[data-highlight="copilot.chat.contextAttachment"]')).toContainText(
    "calculator.py",
  );

  await expectGuidedStep(page, 6, "Auftrag an Copilot formulieren");
  const promptTarget = page.locator('[data-highlight="copilot.chat.prompt"]');
  await expectSpotlightAround(spotlight, promptTarget);
  const prompt = page.getByPlaceholder("Ask Copilot...");
  await prompt.fill("Implementiere bitte die Addition für zwei Zahlen in calculator.py.");
  await prompt.press("Enter");

  await expectGuidedStep(page, 7, "KI-Vorschlag im Editor prüfen und übernehmen");
  await expectSpotlightAround(spotlight, editorHost);
  await page.getByRole("button", { name: "Copilot Chat schließen" }).click();
  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.focus();
  await editor.press("Tab");

  await expectGuidedStep(page, 8, "Datei speichern");
  await editor.press(process.platform === "darwin" ? "Meta+S" : "Control+S");

  await expectGuidedStep(page, 9, "Working-Tree-Diff reviewen");
  await runTerminalCommand(page, "git", "diff");
  await expect(
    page.getByText("diff --git a/calculator.py b/calculator.py", { exact: true }),
  ).toBeVisible();

  await expectGuidedStep(page, 10, "Änderung ausführen und Prüfergebnis interpretieren");
  await runTerminalCommand(page, "python", "calculator.py");
  await expect(page.getByText("CHECK: addition ready", { exact: true })).toBeVisible();

  await expectGuidedStep(page, 11, "Nur die eigene Datei stagen");
  await runTerminalCommand(page, "git", "add", "calculator.py");

  await expectGuidedStep(page, 12, "Klaren Commit erstellen");
  await runTerminalCommand(page, "git", "commit", "-m", '"feat: implement addition"');
  await expect(
    page.getByText(/\[feature\/addition [0-9a-f]+\] feat: implement addition/),
  ).toBeVisible();

  await expectGuidedStep(page, 13, "Handoff-Zustand prüfen");
  await page.getByRole("button", { name: "Source Control", exact: true }).click();
  await expect(page.getByText("M notes.txt", { exact: true })).toBeVisible();
  await runTerminalCommand(page, "git", "status");

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
  await expect(spotlight).toHaveCount(0);
});

test("Challenge: freier Inline-Pfad validiert Endzustand und erklärt ungespeicherte Änderung", async ({
  page,
}) => {
  await page.goto("/training/developer-workflow-basics.challenge");
  await waitUntilReady(page);
  await expect(page.getByRole("button", { name: /Weiter/i })).toHaveCount(0);

  await runTerminalCommand(page, "git", "switch", "-c", "feature/addition");
  await expect(page.locator('[data-highlight="vscode.statusBar"]')).toContainText(
    "feature/addition",
  );

  await expect(page.locator('[data-highlight="copilot.inline.suggestion"]')).toContainText(
    "return a + b",
  );
  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.focus();
  await editor.press("Tab");

  await runTerminalCommand(page, "python", "calculator.py");
  await expect(
    page.getByText(/calculator\.py enthält noch ungespeicherte Änderungen/),
  ).toBeVisible();

  await editor.press(process.platform === "darwin" ? "Meta+S" : "Control+S");
  await runTerminalCommand(page, "python", "calculator.py");
  await expect(page.getByText("CHECK: addition ready", { exact: true }).last()).toBeVisible();

  await runTerminalCommand(page, "git", "add", "calculator.py");
  await runTerminalCommand(page, "git", "commit", "-m", '"feat: calculator addition"');

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Challenge: akzeptiert äquivalenten Code, python3 und Recovery nach git add .", async ({
  page,
}) => {
  await page.goto("/training/developer-workflow-basics.challenge");
  await waitUntilReady(page);

  await runTerminalCommand(page, "git", "switch", "-c", "feature/addition");

  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.focus();
  await editor.press("Tab");
  await editor.fill(
    'def add(left, right):\n    return left + right\n\nprint("CHECK: addition ready")\n',
  );
  await editor.press(process.platform === "darwin" ? "Meta+S" : "Control+S");

  await runTerminalCommand(page, "python3", "calculator.py");
  await expect(page.getByText("CHECK: addition ready", { exact: true }).last()).toBeVisible();

  await runTerminalCommand(page, "git", "add", ".");
  await expect(page.getByText(/git restore --staged notes\.txt/)).toBeVisible();
  await runTerminalCommand(page, "git", "restore", "--staged", "notes.txt");
  await runTerminalCommand(page, "git", "commit", "-m", '"feat: calculator addition"');

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});
