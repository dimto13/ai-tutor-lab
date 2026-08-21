import { getRequest } from "@tanstack/react-start/server";
import { getScenario } from "@/scenarios";
import type { TrainingMode } from "@ai-train-lab/training-engine";
import { createLlmProvider } from "./index";
import {
  InMemoryTutorSessionBudgetStore,
  TutorLlmService,
  type TutorLlmAnswer,
  type TutorLlmContext,
  type TutorSessionBudgetPolicy,
} from "./tutorGuardrails";

const budgetStore = new InMemoryTutorSessionBudgetStore();
const jwksCache = new Map<string, Promise<JsonWebKey[]>>();
const authConfigCache = new Map<string, Promise<CognitoPublicConfig>>();

interface CognitoPublicConfig {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
}

interface VerifiedTutorIdentity {
  userId: string;
  tenantId: string;
}

interface JwtHeader {
  alg?: unknown;
  kid?: unknown;
}

interface JwtPayload {
  iss?: unknown;
  sub?: unknown;
  exp?: unknown;
  token_use?: unknown;
  client_id?: unknown;
  "cognito:groups"?: unknown;
}

export interface TutorLlmServerInput {
  scenarioId: string;
  mode: TrainingMode;
  currentStepId: string | null;
  question: string;
  accessToken: string | null;
  userCode?: string;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function budgetPolicy(env: NodeJS.ProcessEnv): TutorSessionBudgetPolicy {
  return {
    maxRequests: positiveInteger(env.LLM_SESSION_MAX_REQUESTS, 20),
    maxCostMicros: nonNegativeInteger(env.LLM_SESSION_MAX_COST_MICROS, 0),
    maxOutputTokens: positiveInteger(env.LLM_MAX_OUTPUT_TOKENS, 500),
  };
}

function base64UrlBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJwtJson<T>(segment: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(segment))) as T;
}

function tenantFromGroups(groups: unknown, userId: string): string {
  if (groups === undefined) return `personal:${userId}`;
  if (!Array.isArray(groups) || groups.some((group) => typeof group !== "string")) {
    throw new Error("Cognito groups claim is invalid");
  }
  const tenantGroups = groups.filter((group) => group.startsWith("tenant:"));
  if (tenantGroups.length === 0) return `personal:${userId}`;
  if (tenantGroups.length !== 1)
    throw new Error("Cognito identity has ambiguous tenant membership");
  const tenantId = tenantGroups[0]?.slice("tenant:".length).trim();
  if (!tenantId) throw new Error("Cognito tenant membership is empty");
  return tenantId;
}

function cognitoConfigFromEnvironment(env: NodeJS.ProcessEnv): CognitoPublicConfig | null {
  const region = env.COGNITO_REGION ?? env.AWS_REGION;
  const userPoolId = env.COGNITO_USER_POOL_ID;
  const userPoolClientId = env.COGNITO_USER_POOL_CLIENT_ID;
  const configured = [region, userPoolId, userPoolClientId].filter(Boolean).length;
  if (configured === 0) return null;
  if (!region || !userPoolId || !userPoolClientId) {
    throw new Error("Server Cognito environment configuration is incomplete");
  }
  return { region, userPoolId, userPoolClientId };
}

async function loadCognitoPublicConfig(
  origin: string,
  env: NodeJS.ProcessEnv,
): Promise<CognitoPublicConfig> {
  const environmentConfig = cognitoConfigFromEnvironment(env);
  if (environmentConfig) return environmentConfig;

  let cached = authConfigCache.get(origin);
  if (!cached) {
    const pending = (async () => {
      const response = await fetch(new URL("/amplify_outputs.json", origin));
      if (!response.ok) throw new Error("Live Cognito configuration is unavailable");
      const source = (await response.json()) as Record<string, unknown>;
      const auth = source["auth"] as Record<string, unknown> | undefined;
      const region = auth?.["aws_region"];
      const userPoolId = auth?.["user_pool_id"];
      const userPoolClientId = auth?.["user_pool_client_id"];
      if (
        typeof region !== "string" ||
        typeof userPoolId !== "string" ||
        typeof userPoolClientId !== "string" ||
        !region ||
        !userPoolId ||
        !userPoolClientId
      ) {
        throw new Error("Live Cognito configuration is incomplete");
      }
      return { region, userPoolId, userPoolClientId };
    })();
    cached = pending.catch((error) => {
      if (authConfigCache.get(origin) === pending) authConfigCache.delete(origin);
      throw error;
    });
    authConfigCache.set(origin, cached);
  }
  return cached;
}

function cognitoIssuer(config: CognitoPublicConfig): string {
  return `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
}

async function loadJwks(config: CognitoPublicConfig, forceRefresh = false): Promise<JsonWebKey[]> {
  const issuer = cognitoIssuer(config);
  if (forceRefresh) jwksCache.delete(issuer);
  let cached = jwksCache.get(issuer);
  if (!cached) {
    const pending = (async () => {
      const response = await fetch(`${issuer}/.well-known/jwks.json`, { cache: "no-store" });
      if (!response.ok) throw new Error("Cognito signing keys are unavailable");
      const payload = (await response.json()) as { keys?: unknown };
      if (!Array.isArray(payload.keys)) throw new Error("Cognito signing keys are invalid");
      return payload.keys as JsonWebKey[];
    })();
    cached = pending.catch((error) => {
      if (jwksCache.get(issuer) === pending) jwksCache.delete(issuer);
      throw error;
    });
    jwksCache.set(issuer, cached);
  }
  return cached;
}

async function signingKeyFor(config: CognitoPublicConfig, kid: string): Promise<JsonWebKey> {
  let keys = await loadJwks(config);
  let jwk = keys.find((candidate) => candidate.kid === kid);
  if (!jwk) {
    keys = await loadJwks(config, true);
    jwk = keys.find((candidate) => candidate.kid === kid);
  }
  if (!jwk) throw new Error("Cognito signing key was not found");
  return jwk;
}

async function verifyCognitoAccessToken(
  token: string,
  env: NodeJS.ProcessEnv,
): Promise<VerifiedTutorIdentity> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Cognito access token is malformed");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("Cognito access token is malformed");
  }
  const header = decodeJwtJson<JwtHeader>(encodedHeader);
  const payload = decodeJwtJson<JwtPayload>(encodedPayload);
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new Error("Cognito access token algorithm is invalid");
  }

  const request = getRequest();
  const origin = new URL(request.url).origin;
  const config = await loadCognitoPublicConfig(origin, env);
  const issuer = cognitoIssuer(config);
  const jwk = await signingKeyFor(config, header.kid);
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!verified) throw new Error("Cognito access token signature is invalid");
  if (
    payload.iss !== issuer ||
    payload.token_use !== "access" ||
    payload.client_id !== config.userPoolClientId ||
    typeof payload.exp !== "number" ||
    payload.exp <= Math.floor(Date.now() / 1000) ||
    typeof payload.sub !== "string" ||
    !payload.sub
  ) {
    throw new Error("Cognito access token claims are invalid");
  }
  return {
    userId: payload.sub,
    tenantId: tenantFromGroups(payload["cognito:groups"], payload.sub),
  };
}

function optedInTenants(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.LLM_USER_CODE_OPT_IN_TENANTS ?? "")
      .split(",")
      .map((tenantId) => tenantId.trim())
      .filter(Boolean),
  );
}

function mayIncludeUserCode(
  identity: VerifiedTutorIdentity,
  userCode: string | undefined,
  env: NodeJS.ProcessEnv,
): boolean {
  return Boolean(userCode) && optedInTenants(env).has(identity.tenantId);
}

function budgetSessionKey(identity: VerifiedTutorIdentity): string {
  return `identity:${identity.tenantId}:${identity.userId}`;
}

function tutorContextFor(
  scenarioId: string,
  mode: TrainingMode,
  currentStepId: string | null,
): TutorLlmContext {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error("Unknown tutor scenario");
  const step = currentStepId
    ? (scenario.steps.find((candidate) => candidate.id === currentStepId) ?? null)
    : null;
  if (currentStepId && !step) throw new Error("Unknown tutor step");
  const allowedUiTargetRefs = new Set<string>();
  if (step?.highlightTarget) allowedUiTargetRefs.add(step.highlightTarget);
  if (step?.onFailure?.markTarget) allowedUiTargetRefs.add(step.onFailure.markTarget);
  if (mode === "explore") {
    for (const target of scenario.exploreTargets ?? []) allowedUiTargetRefs.add(target);
  }
  return {
    scenarioTitle: scenario.title,
    mode,
    step: step
      ? {
          id: step.id,
          title: step.title,
          instruction: step.instruction,
          rationale: step.rationale ?? step.why ?? null,
        }
      : null,
    allowedUiTargetRefs: [...allowedUiTargetRefs],
  };
}

export async function answerTutorQuestionOnServer(
  input: TutorLlmServerInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<TutorLlmAnswer | { status: "unavailable" }> {
  if (env.LLM_ENABLED !== "true" || !input.accessToken) return { status: "unavailable" };

  let identity: VerifiedTutorIdentity;
  try {
    identity = await verifyCognitoAccessToken(input.accessToken, env);
  } catch {
    return { status: "unavailable" };
  }

  const provider = createLlmProvider(env);
  const service = new TutorLlmService({
    provider,
    budgetStore,
    policy: budgetPolicy(env),
  });
  return service.answer({
    sessionKey: budgetSessionKey(identity),
    context: tutorContextFor(input.scenarioId, input.mode, input.currentStepId),
    question: {
      question: input.question,
      ...(input.userCode ? { userCode: input.userCode } : {}),
    },
    includeUserCode: mayIncludeUserCode(identity, input.userCode, env),
  });
}
