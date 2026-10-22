import { type Page, type TestInfo } from "@playwright/test";

export type JourneyId =
  | "UJ-LOGIN"
  | "UJ-DASHBOARD"
  | "UJ-GUIDED"
  | "UJ-EXPLORE"
  | "UJ-CHALLENGE"
  | "UJ-PERSISTENCE"
  | "UJ-RECOVERY"
  | "UJ-RESPONSIVE";

export const VSCODE_GUIDED_URL = "/training/vscode-basics.guided";
export const VSCODE_GUIDED_STORAGE_KEY =
  "ai-training-lab:tenant:value:local-tenant:user:local-learner:vscode-basics.guided:mode:guided:state:v4";
export const VSCODE_EXPLORE_STORAGE_KEY =
  "ai-training-lab:tenant:value:local-tenant:user:local-learner:vscode-basics.explore:mode:explore:state:v4";
export const VSCODE_CHALLENGE_STORAGE_KEY =
  "ai-training-lab:tenant:value:local-tenant:user:local-learner:vscode-basics.challenge:mode:challenge:state:v4";
export const ARTIFACT_GUIDED_URL = "/training/artifact-preview-foundation.guided";
export const ARTIFACT_GUIDED_STORAGE_KEY =
  "ai-training-lab:tenant:value:local-tenant:user:local-learner:artifact-preview-foundation.guided:mode:guided:state:v4";

export interface LocalSessionSnapshot {
  revision: number | null;
  activeStepId: string | null;
  finishedAt: number | null;
  completedSteps: number;
  exploredTargets: string[];
}

interface JourneyDocumentation {
  id: JourneyId;
  initialState: string;
  successCondition: string;
}

function safeRunToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function documentJourney(
  testInfo: TestInfo,
  { id, initialState, successCondition }: JourneyDocumentation,
): string {
  const executionId = process.env["GITHUB_RUN_ID"] ?? "manual";
  const runId = safeRunToken(
    `${id}-${executionId}-${testInfo.project.name}-w${testInfo.workerIndex}-r${testInfo.retry}`,
  );

  testInfo.annotations.push(
    { type: "journey-id", description: id },
    { type: "synthetic-run-id", description: runId },
    { type: "initial-state", description: initialState },
    { type: "success-condition", description: successCondition },
  );
  return runId;
}

export async function waitForTrainingReady(page: Page): Promise<void> {
  await page.getByRole("status").filter({ hasText: "Training bereit" }).waitFor({
    state: "visible",
  });
}

export async function readLocalSession(
  page: Page,
  storageKey: string,
): Promise<LocalSessionSnapshot | null> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const envelope = JSON.parse(raw) as {
      revision?: unknown;
      value?: {
        activeStepId?: unknown;
        finishedAt?: unknown;
        statuses?: unknown;
        exploredTargets?: unknown;
      };
    };
    const statuses =
      typeof envelope.value?.statuses === "object" && envelope.value.statuses !== null
        ? Object.values(envelope.value.statuses)
        : [];
    const exploredTargets = Array.isArray(envelope.value?.exploredTargets)
      ? envelope.value.exploredTargets.filter(
          (target): target is string => typeof target === "string",
        )
      : [];

    return {
      revision: typeof envelope.revision === "number" ? envelope.revision : null,
      activeStepId:
        typeof envelope.value?.activeStepId === "string" ? envelope.value.activeStepId : null,
      finishedAt: typeof envelope.value?.finishedAt === "number" ? envelope.value.finishedAt : null,
      completedSteps: statuses.filter((status) => status === "COMPLETED" || status === "SKIPPED")
        .length,
      exploredTargets,
    };
  }, storageKey);
}

export async function expectGuidedStep(page: Page, step: number, title: string): Promise<void> {
  await page.getByRole("heading", { name: `Schritt ${step} – ${title}` }).waitFor({
    state: "visible",
  });
}

export async function reachVscodeCreateFileStep(page: Page): Promise<void> {
  await page.goto(VSCODE_GUIDED_URL);
  await waitForTrainingReady(page);
  await expectGuidedStep(page, 1, "Activity Bar einordnen");
  await page.getByRole("button", { name: "Grundbegriffe überspringen" }).click();
  await expectGuidedStep(page, 7, "Explorer öffnen");
  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expectGuidedStep(page, 8, "Einen Ordner als Arbeitskontext öffnen");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /Open Folder\.\.\./ }).click();
  await expectGuidedStep(page, 9, "Datei erstellen");
}

export async function createVscodeFile(page: Page, filename: string): Promise<void> {
  await page.getByRole("button", { name: "Neue Datei", exact: true }).click();
  await page.getByPlaceholder("dateiname.ext").fill(filename);
  await page.getByPlaceholder("dateiname.ext").press("Enter");
}

export async function completeVscodeGuidedFromEditor(page: Page): Promise<void> {
  const editor = page.getByRole("textbox", { name: "Editor-Inhalt" });
  await editor.fill("Hello AI Training");
  await editor.press("Control+s");
  await expectGuidedStep(page, 11, "Bereich und Ansichten unterscheiden");

  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  await page
    .getByRole("menuitem", { name: /New Terminal/ })
    .first()
    .click();
  await expectGuidedStep(page, 12, "Probleme-Ansicht verwenden");

  await page.getByRole("button", { name: "Problems", exact: true }).click();
  await expectGuidedStep(page, 13, "Ausgabe-Ansicht verwenden");
  await page.getByRole("button", { name: "Output", exact: true }).click();
}
