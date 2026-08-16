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
        if (leftKey.endsWith(".accessToken") && rightKey.endsWith(".idToken")) return -1;
        if (leftKey.endsWith(".idToken") && rightKey.endsWith(".accessToken")) return 1;
        return 0;
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
}) => {
  test.setTimeout(240_000);

  const baseURL = requireEnvironmentValue("CLOUD_BASE_URL");
  const marker = process.env.GITHUB_RUN_ID?.trim() || `${Date.now()}`;
  const primaryAccount = credentials("CLOUD_TEST");
  const peerAccount = credentials("CLOUD_TEST_PEER");
  const otherTenantAccount = credentials("CLOUD_TEST_OTHER_TENANT");

  const primary = await signedInPage(browser, baseURL, primaryAccount);
  const primaryPreferences = await savePreferenceMarker(primary.page, marker, "primary");
  const primaryEvidence = await preparePrimaryScoreEvidence(primary.page, marker);
  expect(primaryEvidence.state.userId).toBe(primaryPreferences.userId);
  expect(primaryEvidence.state.tenantId).toBe(primaryPreferences.tenantId);

  const peer = await signedInPage(browser, baseURL, peerAccount);
  const peerBefore = await loadPreferences(peer.page);
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
  await peer.context.close();

  const otherTenant = await signedInPage(browser, baseURL, otherTenantAccount);
  const otherTenantBefore = await loadPreferences(otherTenant.page);
  expect(otherTenantBefore?.accessibility).not.toEqual(primaryPreferences.accessibility);
  const otherTenantPreferences = await savePreferenceMarker(otherTenant.page, marker, "other-tenant");
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

  await otherTenant.context.close();
  await primary.context.close();
});
