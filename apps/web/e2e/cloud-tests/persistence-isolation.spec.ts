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

interface TrainingStateEnvelope {
  tenantId: string;
  userId: string;
  scenarioId: string;
  mode: TrainingMode;
  schemaVersion: number;
  revision: number;
  updatedAt: number;
  payload: unknown;
}

interface RuntimeSnapshotEnvelope extends TrainingStateEnvelope {
  runtimeId: string;
}

interface ScoreAwardEnvelope {
  created: boolean;
  event: {
    id: string;
    tenantId: string;
    userId: string;
    scenarioId: string;
    scenarioVersion: string;
    sessionId: string;
    mode: TrainingMode;
    eventType: string;
    points: number;
    occurredAt: number;
    sourceRevision: number;
    breakdown: unknown;
  };
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

function normalizedTrainingState(state: TrainingStateEnvelope): TrainingStateEnvelope {
  return { ...state, payload: decodeAwsJson(state.payload) };
}

function normalizedRuntimeSnapshot(snapshot: RuntimeSnapshotEnvelope): RuntimeSnapshotEnvelope {
  return { ...snapshot, payload: decodeAwsJson(snapshot.payload) };
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
  variables: Record<string, unknown>,
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
  variables: Record<string, unknown>,
): Promise<T> {
  const result = await graphQLResult<T>(page, query, variables);
  if (result.errors?.length) {
    throw new Error(result.errors.map((error) => error.message).join(" | "));
  }
  if (!result.data) throw new Error("AppSync returned no data.");
  return result.data;
}

const loadTrainingStateDocument = `
  query CloudLoadTrainingState($scenarioId: String!, $mode: TrainingMode!) {
    loadTrainingState(scenarioId: $scenarioId, mode: $mode) {
      tenantId
      userId
      scenarioId
      mode
      schemaVersion
      revision
      updatedAt
      payload
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
      scenarioId
      mode
      schemaVersion
      revision
      updatedAt
      payload
    }
  }
`;

const loadRuntimeSnapshotDocument = `
  query CloudLoadRuntimeSnapshot($scenarioId: String!, $mode: TrainingMode!, $runtimeId: String!) {
    loadRuntimeSnapshot(scenarioId: $scenarioId, mode: $mode, runtimeId: $runtimeId) {
      tenantId
      userId
      scenarioId
      mode
      runtimeId
      schemaVersion
      revision
      updatedAt
      payload
    }
  }
`;

const saveRuntimeSnapshotDocument = `
  mutation CloudSaveRuntimeSnapshot(
    $scenarioId: String!
    $mode: TrainingMode!
    $runtimeId: String!
    $schemaVersion: Int!
    $expectedRevision: Int
    $payload: AWSJSON!
  ) {
    saveRuntimeSnapshot(
      scenarioId: $scenarioId
      mode: $mode
      runtimeId: $runtimeId
      schemaVersion: $schemaVersion
      expectedRevision: $expectedRevision
      payload: $payload
    ) {
      tenantId
      userId
      scenarioId
      mode
      runtimeId
      schemaVersion
      revision
      updatedAt
      payload
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
        sessionId
        mode
        eventType
        points
        occurredAt
        sourceRevision
        breakdown
      }
    }
  }
`;

async function loadTrainingState(
  page: Page,
  scenarioId: string,
  mode: TrainingMode,
): Promise<TrainingStateEnvelope | null> {
  const data = await graphQL<{ loadTrainingState: TrainingStateEnvelope | null }>(
    page,
    loadTrainingStateDocument,
    { scenarioId, mode },
  );
  return data.loadTrainingState ? normalizedTrainingState(data.loadTrainingState) : null;
}

async function saveTrainingState(
  page: Page,
  scenarioId: string,
  mode: TrainingMode,
  payload: unknown,
  expectedRevision: number | null,
): Promise<TrainingStateEnvelope> {
  const data = await graphQL<{ saveTrainingState: TrainingStateEnvelope }>(
    page,
    saveTrainingStateDocument,
    {
      scenarioId,
      mode,
      schemaVersion: 1,
      expectedRevision,
      payload: JSON.stringify(payload),
    },
  );
  return normalizedTrainingState(data.saveTrainingState);
}

async function loadRuntimeSnapshot(
  page: Page,
  scenarioId: string,
  mode: TrainingMode,
  runtimeId: string,
): Promise<RuntimeSnapshotEnvelope | null> {
  const data = await graphQL<{ loadRuntimeSnapshot: RuntimeSnapshotEnvelope | null }>(
    page,
    loadRuntimeSnapshotDocument,
    { scenarioId, mode, runtimeId },
  );
  return data.loadRuntimeSnapshot ? normalizedRuntimeSnapshot(data.loadRuntimeSnapshot) : null;
}

async function saveRuntimeSnapshot(
  page: Page,
  scenarioId: string,
  mode: TrainingMode,
  runtimeId: string,
  payload: unknown,
  expectedRevision: number | null,
): Promise<RuntimeSnapshotEnvelope> {
  const data = await graphQL<{ saveRuntimeSnapshot: RuntimeSnapshotEnvelope }>(
    page,
    saveRuntimeSnapshotDocument,
    {
      scenarioId,
      mode,
      runtimeId,
      schemaVersion: 1,
      expectedRevision,
      payload: JSON.stringify(payload),
    },
  );
  return normalizedRuntimeSnapshot(data.saveRuntimeSnapshot);
}

async function saveTrainingStateResult(
  page: Page,
  scenarioId: string,
  mode: TrainingMode,
  payload: unknown,
  expectedRevision: number | null,
): Promise<GraphQLResult<{ saveTrainingState: TrainingStateEnvelope | null }>> {
  return graphQLResult(page, saveTrainingStateDocument, {
    scenarioId,
    mode,
    schemaVersion: 1,
    expectedRevision,
    payload: JSON.stringify(payload),
  });
}

async function awardScenarioScore(
  page: Page,
  scenarioId: string,
  mode: TrainingMode,
): Promise<ScoreAwardEnvelope> {
  const data = await graphQL<{ awardScenarioScore: ScoreAwardEnvelope }>(
    page,
    awardScenarioScoreDocument,
    { scenarioId, mode },
  );
  return data.awardScenarioScore;
}

test("real cloud persistence is revision-safe, owner-scoped, tenant-scoped and score-idempotent", async ({
  browser,
}) => {
  test.setTimeout(240_000);

  const baseURL = requireEnvironmentValue("CLOUD_BASE_URL");
  const primaryAccount = credentials("CLOUD_TEST");
  const peerAccount = credentials("CLOUD_TEST_PEER");
  const otherTenantAccount = credentials("CLOUD_TEST_OTHER_TENANT");
  const personalAccount = credentials("CLOUD_TEST_PERSONAL");
  const runMarker = process.env.GITHUB_RUN_ID?.trim() || `${Date.now()}`;

  const primary = await signedInPage(browser, baseURL, primaryAccount);

  const resumeScenarioId = "cloud-acceptance-resume-v1";
  const runtimeId = "cloud-acceptance-runtime-v1";
  const existingResume = await loadTrainingState(primary.page, resumeScenarioId, "guided");
  const resumePayload = {
    marker: runMarker,
    scenarioId: resumeScenarioId,
    mode: "guided",
    currentStepId: "cloud-step-2",
    statuses: { "cloud-step-1": "COMPLETED", "cloud-step-2": "ACTIVE" },
  };
  const savedResume = await saveTrainingState(
    primary.page,
    resumeScenarioId,
    "guided",
    resumePayload,
    existingResume?.revision ?? null,
  );

  const existingRuntime = await loadRuntimeSnapshot(
    primary.page,
    resumeScenarioId,
    "guided",
    runtimeId,
  );
  const runtimePayload = {
    marker: runMarker,
    workspace: "/cloud-acceptance",
    activeFile: "README.md",
    terminal: ["git status", "On branch cloud-acceptance"],
  };
  const savedRuntime = await saveRuntimeSnapshot(
    primary.page,
    resumeScenarioId,
    "guided",
    runtimeId,
    runtimePayload,
    existingRuntime?.revision ?? null,
  );

  await primary.context.close();

  const resumed = await signedInPage(browser, baseURL, primaryAccount);
  const resumedState = await loadTrainingState(resumed.page, resumeScenarioId, "guided");
  const resumedRuntime = await loadRuntimeSnapshot(
    resumed.page,
    resumeScenarioId,
    "guided",
    runtimeId,
  );
  expect(resumedState?.revision).toBe(savedResume.revision);
  expect(resumedState?.payload).toEqual(resumePayload);
  expect(resumedRuntime?.revision).toBe(savedRuntime.revision);
  expect(resumedRuntime?.payload).toEqual(runtimePayload);

  const staleWriter = await signedInPage(browser, baseURL, primaryAccount);
  const revisionScenarioId = "cloud-acceptance-revision-v1";
  const existingRevisionState = await loadTrainingState(
    resumed.page,
    revisionScenarioId,
    "explore",
  );
  const baselineRevision = await saveTrainingState(
    resumed.page,
    revisionScenarioId,
    "explore",
    { marker: runMarker, writer: "baseline" },
    existingRevisionState?.revision ?? null,
  );
  const winnerPayload = { marker: runMarker, writer: "winner" };
  const winner = await saveTrainingState(
    resumed.page,
    revisionScenarioId,
    "explore",
    winnerPayload,
    baselineRevision.revision,
  );
  const staleResult = await saveTrainingStateResult(
    staleWriter.page,
    revisionScenarioId,
    "explore",
    { marker: runMarker, writer: "stale" },
    baselineRevision.revision,
  );
  expect(staleResult.errors?.length ?? 0).toBeGreaterThan(0);
  const authoritativeAfterConflict = await loadTrainingState(
    staleWriter.page,
    revisionScenarioId,
    "explore",
  );
  expect(authoritativeAfterConflict?.revision).toBe(winner.revision);
  expect(authoritativeAfterConflict?.payload).toEqual(winnerPayload);
  await staleWriter.context.close();

  const isolationScenarioId = "cloud-acceptance-isolation-v1";
  const existingPrimaryIsolation = await loadTrainingState(
    resumed.page,
    isolationScenarioId,
    "explore",
  );
  const primaryIsolationPayload = { marker: runMarker, owner: "primary" };
  const primaryIsolation = await saveTrainingState(
    resumed.page,
    isolationScenarioId,
    "explore",
    primaryIsolationPayload,
    existingPrimaryIsolation?.revision ?? null,
  );

  const peer = await signedInPage(browser, baseURL, peerAccount);
  const peerBefore = await loadTrainingState(peer.page, isolationScenarioId, "explore");
  expect(peerBefore?.payload).not.toEqual(primaryIsolationPayload);
  const peerIsolation = await saveTrainingState(
    peer.page,
    isolationScenarioId,
    "explore",
    { marker: runMarker, owner: "peer" },
    peerBefore?.revision ?? null,
  );
  expect(peerIsolation.tenantId).toBe(primaryIsolation.tenantId);
  expect(peerIsolation.userId).not.toBe(primaryIsolation.userId);
  const primaryAfterPeerWrite = await loadTrainingState(
    resumed.page,
    isolationScenarioId,
    "explore",
  );
  expect(primaryAfterPeerWrite?.payload).toEqual(primaryIsolationPayload);
  await peer.context.close();

  const otherTenant = await signedInPage(browser, baseURL, otherTenantAccount);
  const otherTenantBefore = await loadTrainingState(
    otherTenant.page,
    isolationScenarioId,
    "explore",
  );
  expect(otherTenantBefore?.payload).not.toEqual(primaryIsolationPayload);
  const otherTenantIsolation = await saveTrainingState(
    otherTenant.page,
    isolationScenarioId,
    "explore",
    { marker: runMarker, owner: "other-tenant" },
    otherTenantBefore?.revision ?? null,
  );
  expect(otherTenantIsolation.tenantId).not.toBe(primaryIsolation.tenantId);
  expect(otherTenantIsolation.userId).not.toBe(primaryIsolation.userId);
  const primaryAfterOtherTenantWrite = await loadTrainingState(
    resumed.page,
    isolationScenarioId,
    "explore",
  );
  expect(primaryAfterOtherTenantWrite?.payload).toEqual(primaryIsolationPayload);
  await otherTenant.context.close();

  const personal = await signedInPage(browser, baseURL, personalAccount);
  const personalScenarioId = "cloud-acceptance-personal-v1";
  const existingPersonal = await loadTrainingState(personal.page, personalScenarioId, "explore");
  const personalState = await saveTrainingState(
    personal.page,
    personalScenarioId,
    "explore",
    { marker: runMarker, owner: "personal" },
    existingPersonal?.revision ?? null,
  );
  expect(personalState.tenantId).toBe(`personal:${personalState.userId}`);
  expect(personalState.tenantId).not.toBe(primaryIsolation.tenantId);
  await personal.context.close();

  const scoreScenarioId = "vscode-shortcuts.challenge";
  const existingScoreState = await loadTrainingState(resumed.page, scoreScenarioId, "challenge");
  const finishedAt = Date.now();
  const scoreState = await saveTrainingState(
    resumed.page,
    scoreScenarioId,
    "challenge",
    {
      id: `cloud-acceptance-score-${runMarker}`,
      scenarioId: scoreScenarioId,
      mode: "challenge",
      startedAt: finishedAt - 120_000,
      finishedAt,
      challengeOutcome: "passed",
      mistakes: 0,
      hintUsage: [],
    },
    existingScoreState?.revision ?? null,
  );
  const firstAward = await awardScenarioScore(resumed.page, scoreScenarioId, "challenge");
  const secondAward = await awardScenarioScore(resumed.page, scoreScenarioId, "challenge");
  expect(secondAward.created).toBe(false);
  expect(secondAward.event.id).toBe(firstAward.event.id);
  expect(secondAward.event.tenantId).toBe(scoreState.tenantId);
  expect(secondAward.event.userId).toBe(scoreState.userId);
  expect(secondAward.event.scenarioId).toBe(scoreScenarioId);
  expect(secondAward.event.scenarioVersion).toBe("1");

  await resumed.context.close();
});
