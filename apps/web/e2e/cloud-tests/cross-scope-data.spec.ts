import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

interface TestCredentials {
  email: string;
  password: string;
}

interface GraphQLErrorShape {
  message: string;
  errorType?: string;
}

interface GraphQLResult<T> {
  data?: T;
  errors?: GraphQLErrorShape[];
}

type TrainingMode = "explore" | "guided" | "challenge";
type SelfAssessedAiLevel = "beginner" | "intermediate" | "advanced";

interface UserPreferencesEnvelope {
  tenantId: string;
  userId: string;
  language: string | null;
  preferredTrainingMode: TrainingMode | null;
  weeklyGoalMinutes: number | null;
  accessibility: unknown;
  selfAssessedAiLevel: SelfAssessedAiLevel | null;
  revision: number;
  updatedAt: number;
}

interface TrainingStateEnvelope {
  tenantId: string;
  userId: string;
  revision: number;
}

interface ScenarioRunEnvelope {
  id: string;
  tenantId: string;
  userId: string;
  scenarioId: string;
  scenarioVersion: string;
  sourceRevision: number;
}

interface ScoreEventEnvelope {
  id: string;
  tenantId: string;
  userId: string;
  scenarioId: string;
  scenarioVersion: string;
  sourceRevision: number;
}

interface ScoreAwardEnvelope {
  created: boolean;
  event: ScoreEventEnvelope;
}

interface PreferenceRestoreEntry {
  baseURL: string;
  account: TestCredentials;
  original: UserPreferencesEnvelope | null;
}

const preferenceRestoreByTestId = new Map<string, PreferenceRestoreEntry[]>();

function requireEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for authenticated cloud acceptance.`);
  return name.endsWith("_PASSWORD") ? value : value.trim();
}

function credentials(prefix: string): TestCredentials {
  return {
    email: requireEnvironmentValue(`${prefix}_EMAIL`),
    password: requireEnvironmentValue(`${prefix}_PASSWORD`),
  };
}

function decodeAwsJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return JSON.parse(value) as unknown;
}

function encodeAwsJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function signIn(page: Page, account: TestCredentials): Promise<void> {
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail").fill(account.email);
  await page.getByLabel("Passwort").fill(account.password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
}

async function signedInPage(
  browser: Browser,
  baseURL: string,
  account: TestCredentials,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await signIn(page, account);
  return { context, page };
}

async function graphQLResult<T>(
  page: Page,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<GraphQLResult<T>> {
  return page.evaluate(
    async ({ query: document, variables: operationVariables }) => {
      const outputsResponse = await fetch("/amplify_outputs.json", { cache: "no-store" });
      if (!outputsResponse.ok) {
        throw new Error(`Unable to load Amplify outputs (HTTP ${outputsResponse.status}).`);
      }
      const outputs = (await outputsResponse.json()) as { data?: { url?: string } };
      const dataUrl = outputs.data?.url;
      if (!dataUrl) throw new Error("Live Amplify outputs do not contain data.url.");

      const tokenEntries = Object.entries(localStorage).filter(
        ([key, value]) =>
          (key.endsWith(".accessToken") || key.endsWith(".idToken")) &&
          typeof value === "string" &&
          value.split(".").length === 3,
      );
      tokenEntries.sort(([leftKey], [rightKey]) => {
        const leftRank = leftKey.endsWith(".accessToken") ? 0 : 1;
        const rightRank = rightKey.endsWith(".accessToken") ? 0 : 1;
        const rankDifference = leftRank - rightRank;
        return rankDifference === 0 ? leftKey.localeCompare(rightKey) : rankDifference;
      });
      if (tokenEntries.length === 0) {
        throw new Error("Authenticated Cognito session token was not found in browser storage.");
      }

      let lastResult: GraphQLResult<T> | null = null;
      for (const [, token] of tokenEntries) {
        const response = await fetch(dataUrl, {
          method: "POST",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: document, variables: operationVariables }),
        });
        const result = (await response.json()) as GraphQLResult<T>;
        lastResult = result;
        const unauthorized = result.errors?.some(
          (error) =>
            error.errorType === "UnauthorizedException" ||
            error.message.toLowerCase().includes("not authorized"),
        );
        if (response.ok && !unauthorized) return result;
      }

      return lastResult ?? { errors: [{ message: "No Cognito token was accepted by AppSync." }] };
    },
    { query, variables },
  );
}

async function graphQL<T>(
  page: Page,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const result = await graphQLResult<T>(page, query, variables);
  if (result.errors?.length) {
    throw new Error(result.errors.map((error) => error.message).join(" | "));
  }
  if (!result.data) throw new Error("AppSync returned no data.");
  return result.data;
}

const loadUserPreferencesDocument = `
  query CloudLoadUserPreferences {
    loadUserPreferences {
      tenantId
      userId
      language
      preferredTrainingMode
      weeklyGoalMinutes
      accessibility
      selfAssessedAiLevel
      revision
      updatedAt
    }
  }
`;

const saveUserPreferencesDocument = `
  mutation CloudSaveUserPreferences(
    $language: String
    $preferredTrainingMode: TrainingMode
    $weeklyGoalMinutes: Int
    $accessibility: AWSJSON
    $selfAssessedAiLevel: SelfAssessedAiLevel
    $expectedRevision: Int
  ) {
    saveUserPreferences(
      language: $language
      preferredTrainingMode: $preferredTrainingMode
      weeklyGoalMinutes: $weeklyGoalMinutes
      accessibility: $accessibility
      selfAssessedAiLevel: $selfAssessedAiLevel
      expectedRevision: $expectedRevision
    ) {
      tenantId
      userId
      language
      preferredTrainingMode
      weeklyGoalMinutes
      accessibility
      selfAssessedAiLevel
      revision
      updatedAt
    }
  }
`;

const loadTrainingStateDocument = `
  query CloudLoadTrainingState($scenarioId: String!, $mode: TrainingMode!) {
    loadTrainingState(scenarioId: $scenarioId, mode: $mode) {
      tenantId
      userId
      revision
    }
  }
`;

const saveTrainingStateDocument = `
  mutation CloudSaveTrainingState(
    $scenarioId: String!
    $mode: TrainingMode!
    $schemaVersion: Int!
    $expectedRevision: Int
    $payload: AWSJSON!
  ) {
    saveTrainingState(
      scenarioId: $scenarioId
      mode: $mode
      schemaVersion: $schemaVersion
      expectedRevision: $expectedRevision
      payload: $payload
    ) {
      tenantId
      userId
      revision
    }
  }
`;

const awardScenarioScoreDocument = `
  mutation CloudAwardScenarioScore($scenarioId: String!, $mode: TrainingMode!) {
    awardScenarioScore(scenarioId: $scenarioId, mode: $mode) {
      created
      event {
        id
        tenantId
        userId
        scenarioId
        scenarioVersion
        sourceRevision
      }
    }
  }
`;

const listMyScenarioRunsDocument = `
  query CloudListMyScenarioRuns($limit: Int) {
    listMyScenarioRuns(limit: $limit) {
      id
      tenantId
      userId
      scenarioId
      scenarioVersion
      sourceRevision
    }
  }
`;

const listMyScoreEventsDocument = `
  query CloudListMyScoreEvents($limit: Int) {
    listMyScoreEvents(limit: $limit) {
      id
      tenantId
      userId
      scenarioId
      scenarioVersion
      sourceRevision
    }
  }
`;

async function loadPreferences(page: Page): Promise<UserPreferencesEnvelope | null> {
  const data = await graphQL<{ loadUserPreferences: UserPreferencesEnvelope | null }>(
    page,
    loadUserPreferencesDocument,
  );
  if (!data.loadUserPreferences) return null;
  return {
    ...data.loadUserPreferences,
    accessibility: decodeAwsJson(data.loadUserPreferences.accessibility),
  };
}

async function savePreferenceMarker(
  page: Page,
  marker: string,
  owner: string,
): Promise<UserPreferencesEnvelope> {
  const current = await loadPreferences(page);
  const data = await graphQL<{ saveUserPreferences: UserPreferencesEnvelope }>(
    page,
    saveUserPreferencesDocument,
    {
      language: current?.language ?? null,
      preferredTrainingMode: current?.preferredTrainingMode ?? null,
      weeklyGoalMinutes: current?.weeklyGoalMinutes ?? null,
      accessibility: JSON.stringify({ cloudAcceptanceMarker: marker, owner }),
      selfAssessedAiLevel: current?.selfAssessedAiLevel ?? null,
      expectedRevision: current?.revision ?? null,
    },
  );
  return {
    ...data.saveUserPreferences,
    accessibility: decodeAwsJson(data.saveUserPreferences.accessibility),
  };
}

function rememberPreferenceRestore(
  testId: string,
  baseURL: string,
  account: TestCredentials,
  original: UserPreferencesEnvelope | null,
): void {
  const entries = preferenceRestoreByTestId.get(testId) ?? [];
  entries.push({ baseURL, account, original });
  preferenceRestoreByTestId.set(testId, entries);
}

async function restorePreferences(browser: Browser, entry: PreferenceRestoreEntry): Promise<void> {
  const signedIn = await signedInPage(browser, entry.baseURL, entry.account);
  try {
    const current = await loadPreferences(signedIn.page);
    if (!current && !entry.original) return;
    const original = entry.original;
    await graphQL(signedIn.page, saveUserPreferencesDocument, {
      language: original?.language ?? null,
      preferredTrainingMode: original?.preferredTrainingMode ?? null,
      weeklyGoalMinutes: original?.weeklyGoalMinutes ?? null,
      accessibility: encodeAwsJson(original?.accessibility ?? null),
      selfAssessedAiLevel: original?.selfAssessedAiLevel ?? null,
      expectedRevision: current?.revision ?? null,
    });
  } finally {
    await signedIn.context.close();
  }
}

test.afterEach(async ({ browser }, testInfo) => {
  const entries = preferenceRestoreByTestId.get(testInfo.testId) ?? [];
  preferenceRestoreByTestId.delete(testInfo.testId);
  const failures: unknown[] = [];

  for (const entry of entries.reverse()) {
    try {
      await restorePreferences(browser, entry);
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length === 0) return;
  if (testInfo.status === testInfo.expectedStatus) {
    throw new AggregateError(failures, "Cloud preference cleanup failed.");
  }
  console.error(
    "Cloud preference cleanup failed after an already failed acceptance test.",
    ...failures,
  );
});

async function preparePrimaryScoreEvidence(
  page: Page,
  marker: string,
): Promise<{ state: TrainingStateEnvelope; award: ScoreAwardEnvelope; run: ScenarioRunEnvelope }> {
  const scenarioId = "vscode-shortcuts.challenge";
  const mode: TrainingMode = "challenge";
  const current = await graphQL<{ loadTrainingState: TrainingStateEnvelope | null }>(
    page,
    loadTrainingStateDocument,
    { scenarioId, mode },
  );
  const finishedAt = Date.now();
  const saved = await graphQL<{ saveTrainingState: TrainingStateEnvelope }>(
    page,
    saveTrainingStateDocument,
    {
      scenarioId,
      mode,
      schemaVersion: 1,
      expectedRevision: current.loadTrainingState?.revision ?? null,
      payload: JSON.stringify({
        id: `cloud-cross-scope-${marker}`,
        scenarioId,
        mode,
        startedAt: finishedAt - 120_000,
        finishedAt,
        challengeOutcome: "passed",
        mistakes: 0,
        hintUsage: [],
      }),
    },
  );
  const awardData = await graphQL<{ awardScenarioScore: ScoreAwardEnvelope }>(
    page,
    awardScenarioScoreDocument,
    { scenarioId, mode },
  );
  const runsData = await graphQL<{ listMyScenarioRuns: ScenarioRunEnvelope[] }>(
    page,
    listMyScenarioRunsDocument,
    { limit: 100 },
  );
  const run = runsData.listMyScenarioRuns.find(
    (candidate) =>
      candidate.scenarioId === scenarioId &&
      candidate.sourceRevision === saved.saveTrainingState.revision,
  );
  if (!run) throw new Error("Primary cloud acceptance scenario run was not persisted.");
  return { state: saved.saveTrainingState, award: awardData.awardScenarioScore, run };
}

async function listRuns(page: Page): Promise<ScenarioRunEnvelope[]> {
  const data = await graphQL<{ listMyScenarioRuns: ScenarioRunEnvelope[] }>(
    page,
    listMyScenarioRunsDocument,
    { limit: 100 },
  );
  return data.listMyScenarioRuns;
}

async function listScores(page: Page): Promise<ScoreEventEnvelope[]> {
  const data = await graphQL<{ listMyScoreEvents: ScoreEventEnvelope[] }>(
    page,
    listMyScoreEventsDocument,
    { limit: 100 },
  );
  return data.listMyScoreEvents;
}

async function assertNoForeignEvidence(
  page: Page,
  expectedUserId: string,
  foreignRunId: string,
  foreignScoreId: string,
): Promise<void> {
  const runs = await listRuns(page);
  const scores = await listScores(page);

  expect(runs.some((run) => run.id === foreignRunId)).toBe(false);
  expect(scores.some((score) => score.id === foreignScoreId)).toBe(false);
  expect(runs.every((run) => run.userId === expectedUserId)).toBe(true);
  expect(scores.every((score) => score.userId === expectedUserId)).toBe(true);
}

test("preferences, scenario runs and score events stay isolated across users and tenants", async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);

  const baseURL = requireEnvironmentValue("CLOUD_BASE_URL");
  const marker = process.env.GITHUB_RUN_ID?.trim() || `${Date.now()}`;
  const primaryAccount = credentials("CLOUD_TEST");
  const peerAccount = credentials("CLOUD_TEST_PEER");
  const otherTenantAccount = credentials("CLOUD_TEST_OTHER_TENANT");
  const contexts: BrowserContext[] = [];

  try {
    const primary = await signedInPage(browser, baseURL, primaryAccount);
    contexts.push(primary.context);
    const primaryBefore = await loadPreferences(primary.page);
    rememberPreferenceRestore(testInfo.testId, baseURL, primaryAccount, primaryBefore);
    const primaryPreferences = await savePreferenceMarker(primary.page, marker, "primary");

    // Training-state, ScenarioRun and ScoreEvent records below are intentionally dedicated
    // acceptance evidence. ScenarioRun/ScoreEvent are append-only audit evidence and have no
    // client-authorized deletion path; the mutable account preferences are restored in afterEach.
    const primaryEvidence = await preparePrimaryScoreEvidence(primary.page, marker);
    expect(primaryEvidence.state.userId).toBe(primaryPreferences.userId);
    expect(primaryEvidence.state.tenantId).toBe(primaryPreferences.tenantId);

    const peer = await signedInPage(browser, baseURL, peerAccount);
    contexts.push(peer.context);
    const peerBefore = await loadPreferences(peer.page);
    rememberPreferenceRestore(testInfo.testId, baseURL, peerAccount, peerBefore);
    expect(peerBefore?.accessibility).not.toEqual(primaryPreferences.accessibility);
    const peerPreferences = await savePreferenceMarker(peer.page, marker, "peer");
    expect(peerPreferences.tenantId).toBe(primaryPreferences.tenantId);
    expect(peerPreferences.userId).not.toBe(primaryPreferences.userId);
    await assertNoForeignEvidence(
      peer.page,
      peerPreferences.userId,
      primaryEvidence.run.id,
      primaryEvidence.award.event.id,
    );
    const primaryAfterPeerWrite = await loadPreferences(primary.page);
    expect(primaryAfterPeerWrite?.accessibility).toEqual(primaryPreferences.accessibility);

    const otherTenant = await signedInPage(browser, baseURL, otherTenantAccount);
    contexts.push(otherTenant.context);
    const otherTenantBefore = await loadPreferences(otherTenant.page);
    rememberPreferenceRestore(testInfo.testId, baseURL, otherTenantAccount, otherTenantBefore);
    expect(otherTenantBefore?.accessibility).not.toEqual(primaryPreferences.accessibility);
    const otherTenantPreferences = await savePreferenceMarker(
      otherTenant.page,
      marker,
      "other-tenant",
    );
    expect(otherTenantPreferences.tenantId).not.toBe(primaryPreferences.tenantId);
    expect(otherTenantPreferences.userId).not.toBe(primaryPreferences.userId);
    await assertNoForeignEvidence(
      otherTenant.page,
      otherTenantPreferences.userId,
      primaryEvidence.run.id,
      primaryEvidence.award.event.id,
    );
    const primaryAfterOtherTenantWrite = await loadPreferences(primary.page);
    expect(primaryAfterOtherTenantWrite?.accessibility).toEqual(primaryPreferences.accessibility);
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
});
