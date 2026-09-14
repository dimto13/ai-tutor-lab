import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  CancelCommandCommand,
  DescribeInstanceInformationCommand,
  GetCommandInvocationCommand,
  SendCommandCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import { REQUEST_AAD, RESPONSE_AAD, deriveRelayKeys, openPayload, sealPayload } from "./keys.js";
import { buildHealthCommand, buildRelayCommand } from "./relayProgram.js";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES = 50;
const MAX_OUTPUT_TOKENS = 4096;
const ROLES = new Set(["system", "user", "assistant"]);
const PENDING_STATUSES = new Set(["Pending", "InProgress", "Delayed"]);
const ROUTE_HEADERS = ["x-ollama-route", "x-ollama-account", "via"];
const CHAT_FAILURES = {
  send_failed: [503, "relay node unavailable"],
  status_failed: [502, "relay status unavailable"],
  command_failed: [502, "relay command failed"],
  output_unusable: [502, "relay output unusable"],
  deadline: [504, "relay deadline exceeded"],
};
const HEALTH_STATES = new Set(["ok", "degraded", "down", "unknown", "missing"]);
// Every model route needs these; the cloud route or Ollama on the RMI-PC comes on top.
const PATH_CHECKS = ["ssm", "sshNas", "rotator"];
const STATION_CHECKS = [...PATH_CHECKS, "cloudRoute", "ollama"];
const HEALTH_CODE = /^[a-z0-9-]{1,40}$/;
const OLLAMA_VERSION = /^[0-9A-Za-z.+-]{1,32}$/;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadRelayConfig(env = process.env) {
  const instanceId = env["TUTOR_RELAY_MANAGED_INSTANCE_ID"] ?? "";
  if (!/^mi-[0-9a-f]{17}$/.test(instanceId)) {
    throw new Error("TUTOR_RELAY_MANAGED_INSTANCE_ID is missing or invalid");
  }
  const { bearer, payloadKey } = deriveRelayKeys(env["TUTOR_RELAY_KEY"]);
  return {
    instanceId,
    bearer,
    payloadKey,
    sshHost: env["TUTOR_RELAY_SSH_HOST"] || "nas",
    rotatorUrl: env["TUTOR_RELAY_ROTATOR_URL"] || "http://localhost:11435/v1/chat/completions",
    // Ollama on the RMI-PC itself, the target of the rotator's `@local` route; read by the health check.
    ollamaUrl: env["TUTOR_RELAY_OLLAMA_URL"] || "http://localhost:11434",
    primaryModel: env["TUTOR_RELAY_PRIMARY_MODEL"] || "gemma4:31b",
    // An empty value disables the fallback attempt.
    fallbackModel: env["TUTOR_RELAY_FALLBACK_MODEL"] ?? "gemma4:e4b@local",
    primaryTimeoutSeconds: positiveInteger(env["TUTOR_RELAY_PRIMARY_TIMEOUT_SECONDS"], 10),
    fallbackTimeoutSeconds: positiveInteger(env["TUTOR_RELAY_FALLBACK_TIMEOUT_SECONDS"], 9),
    // Amplify Hosting ends SSR requests after 30 s; the relay answers or gives up well before.
    deadlineMs: positiveInteger(env["TUTOR_RELAY_DEADLINE_MS"], 22_000),
    // Unset by default: without its reasoning step gemma4:e4b drops `kind` and `uiTargetRefs`.
    reasoningEffort: env["TUTOR_RELAY_REASONING_EFFORT"] ?? "",
  };
}

function log(fields) {
  console.log(JSON.stringify({ component: "tutor-relay", ...fields }));
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function errorResponse(statusCode, message) {
  return jsonResponse(statusCode, { error: { message } });
}

function authorized(event, bearer) {
  const actual = Buffer.from(String(event.headers?.["authorization"] ?? ""));
  const expected = Buffer.from(`Bearer ${bearer}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function requestBody(event) {
  const raw = String(event.body ?? "");
  return event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
}

/** Forwards only what the tutor provider sends; the relay, not the caller, picks the model. */
export function upstreamBody(request, model, reasoningEffort) {
  const messages = request?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return null;
  }
  const forwarded = [];
  for (const message of messages) {
    if (!ROLES.has(message?.role) || typeof message.content !== "string") return null;
    forwarded.push({ role: message.role, content: message.content });
  }

  const body = { model, messages: forwarded, stream: false };
  const { temperature, max_tokens: maxTokens, response_format: responseFormat } = request;
  if (typeof temperature === "number" && temperature >= 0 && temperature <= 2) {
    body.temperature = temperature;
  }
  if (Number.isInteger(maxTokens) && maxTokens > 0 && maxTokens <= MAX_OUTPUT_TOKENS) {
    body.max_tokens = maxTokens;
  }
  if (responseFormat?.type === "json_object") body.response_format = { type: "json_object" };
  if (reasoningEffort) body.reasoning_effort = reasoningEffort;
  return body;
}

const JSON_FENCE = /^\s*```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n?[ \t]*```\s*$/i;

/** The cloud route wraps JSON in a Markdown fence even when a JSON object was requested. */
export function unwrapJsonFence(body, requestedJson) {
  if (!requestedJson) return body;
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return body;
  }
  const message = payload?.choices?.[0]?.message;
  const match = typeof message?.content === "string" ? JSON_FENCE.exec(message.content) : null;
  if (!match) return body;
  message.content = (match[1] ?? "").trim();
  return JSON.stringify(payload);
}

function relayResult(stdout, config, id) {
  const line = stdout
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("TRELAY1:") || entry.startsWith("TRELAYERR:"));
  if (!line) return { error: "relay_output_missing" };
  if (line.startsWith("TRELAYERR:")) return { error: `relay_node_${line.slice(10)}` };

  let result;
  try {
    result = JSON.parse(openPayload(config.payloadKey, line.slice(8), RESPONSE_AAD));
  } catch {
    return { error: "relay_output_invalid" };
  }
  if (result?.v !== 1 || result.id !== id) return { error: "relay_output_mismatch" };
  return { result };
}

// curl could not connect to the rotator, or it closed the connection without an answer.
const ROTATOR_EXITS = new Set(["transport-exit-7", "transport-exit-52", "transport-exit-56"]);

/**
 * Names the station behind a failed attempt (#481) from the signals of the relay program: SSH exit
 * 255 is the NAS, curl's connection errors the rotator, 429 a busy upstream and 5xx the route that
 * was asked. Nothing here reads prompt or answer.
 */
export function attemptFailure(attempt) {
  if (attempt?.status === 200) return undefined;
  const error = typeof attempt?.error === "string" ? attempt.error : "";
  if (error === "transport-exit-255") return "nas_unreachable";
  if (ROTATOR_EXITS.has(error)) return "rotator_offline";
  if (error === "timeout" || error === "transport-exit-28") return "timeout";
  if (error) return "transport_error";
  const status = Number.isSafeInteger(attempt?.status) ? attempt.status : 0;
  if (status === 429) return "busy";
  if (status >= 500) {
    return String(attempt?.model ?? "").endsWith("@local")
      ? "local_unavailable"
      : "cloud_unavailable";
  }
  return "provider_error";
}

function healthState(value) {
  return HEALTH_STATES.has(value) ? value : "unknown";
}

function healthCode(value) {
  return typeof value === "string" && HEALTH_CODE.test(value) ? value : undefined;
}

function healthCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function modelCheck(name, reported) {
  if (!name) return undefined;
  return {
    name,
    route: name.endsWith("@local") ? "local" : "cloud",
    status: healthState(reported?.status),
    loaded: typeof reported?.loaded === "boolean" ? reported.loaded : undefined,
  };
}

/** Takes over known fields only: whatever else the node reports stays out of answer and log. */
function reportedChecks(health, config) {
  const version = health?.ollama?.version;
  return {
    sshNas: {
      status: healthState(health?.sshNas?.status),
      error: healthCode(health?.sshNas?.error),
    },
    rotator: {
      status: healthState(health?.rotator?.status),
      cloudAccounts: healthCount(health?.rotator?.cloudAccounts),
      cloudAccountsFree: healthCount(health?.rotator?.cloudAccountsFree),
      httpStatus: healthCount(health?.rotator?.httpStatus),
    },
    cloudRoute: {
      status: healthState(health?.cloudRoute?.status),
      error: healthCode(health?.cloudRoute?.error),
      httpStatus: healthCount(health?.cloudRoute?.httpStatus),
    },
    ollama: {
      status: healthState(health?.ollama?.status),
      version: typeof version === "string" && OLLAMA_VERSION.test(version) ? version : undefined,
    },
    models: {
      primary: modelCheck(config.primaryModel, health?.models?.primary),
      fallback: modelCheck(config.fallbackModel, health?.models?.fallback),
    },
  };
}

function modelUsable(checks, model) {
  if (model?.status !== "ok") return false;
  const via = model.route === "local" ? "ollama" : "cloudRoute";
  return [...PATH_CHECKS, via].every((name) => checks[name]?.status === "ok");
}

/** `degraded` still answers over at least one model route; `down` leaves only the fallback #28. */
function overallHealth(checks) {
  const models = Object.values(checks.models).filter(Boolean);
  if (!models.some((model) => modelUsable(checks, model))) return "down";
  // Only the stations the configured models use decide between `ok` and `degraded`.
  const stations = new Set(PATH_CHECKS);
  for (const model of models) stations.add(model.route === "local" ? "ollama" : "cloudRoute");
  const healthy =
    [...stations].every((name) => checks[name].status === "ok") &&
    models.every((model) => modelUsable(checks, model));
  return healthy ? "ok" : "degraded";
}

function healthSummary(checks) {
  const summary = Object.fromEntries(STATION_CHECKS.map((name) => [name, checks[name].status]));
  for (const [role, model] of Object.entries(checks.models)) {
    if (model) summary[role] = model.status;
  }
  return summary;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createTutorRelayHandler({
  send,
  config,
  now = () => Date.now(),
  sleep = defaultSleep,
  newId = randomUUID,
}) {
  /** Runs one fixed program on the RMI-PC and returns its sealed answer, or why there is none. */
  async function runOnNode(command, comment, fields, startedAt) {
    const deadline = startedAt + config.deadlineMs;
    let commandId;
    try {
      const sent = await send(
        new SendCommandCommand({
          DocumentName: "AWS-RunShellScript",
          InstanceIds: [config.instanceId],
          Parameters: {
            commands: [command],
            executionTimeout: [String(Math.ceil(config.deadlineMs / 1000))],
          },
          TimeoutSeconds: 30,
          Comment: comment,
        }),
      );
      commandId = sent?.Command?.CommandId;
    } catch (error) {
      // SSM refuses commands for a managed node that is not registered or not online.
      const failure = error?.name === "InvalidInstanceId" ? "node_offline" : "ssm_error";
      log({ ...fields, outcome: "send_failed", failure, error: error?.name ?? "unknown" });
      return { failure: "send_failed" };
    }
    if (!commandId) {
      log({ ...fields, outcome: "send_failed", failure: "ssm_error", error: "no_command_id" });
      return { failure: "send_failed" };
    }

    let delay = 400;
    let lastStatus;
    while (now() + delay < deadline) {
      await sleep(delay);
      delay = Math.min(delay + 300, 1000);
      let invocation;
      try {
        invocation = await send(
          new GetCommandInvocationCommand({ CommandId: commandId, InstanceId: config.instanceId }),
        );
      } catch (error) {
        // Not visible on the node yet, or SSM throttles the status call: keep polling.
        if (error?.name === "InvocationDoesNotExist" || error?.name === "ThrottlingException") {
          continue;
        }
        log({
          ...fields,
          commandId,
          outcome: "status_failed",
          failure: "ssm_error",
          error: error?.name ?? "unknown",
        });
        return { failure: "status_failed" };
      }
      lastStatus = invocation?.Status;
      if (PENDING_STATUSES.has(invocation?.Status)) continue;

      const durationMs = now() - startedAt;
      if (invocation?.Status !== "Success") {
        const details = invocation?.StatusDetails;
        let failure = "relay_node_error";
        if (details === "Undeliverable" || details === "DeliveryTimedOut") failure = "node_offline";
        if (details === "ExecutionTimedOut") failure = "timeout";
        log({
          ...fields,
          commandId,
          outcome: "command_failed",
          failure,
          status: invocation?.Status,
          statusDetails: details,
          durationMs,
        });
        return { failure: "command_failed" };
      }
      const { result, error } = relayResult(
        invocation.StandardOutputContent ?? "",
        config,
        fields.id,
      );
      if (error) {
        log({ ...fields, commandId, outcome: error, failure: "relay_node_error", durationMs });
        return { failure: "output_unusable" };
      }
      return { result, commandId, durationMs };
    }

    try {
      await send(
        new CancelCommandCommand({ CommandId: commandId, InstanceIds: [config.instanceId] }),
      );
    } catch {
      // The command times out on the node on its own; cancelling is best effort.
    }
    // A command that never started points at the node, a running one at a slow upstream.
    const failure = lastStatus === "InProgress" ? "timeout" : "node_offline";
    log({ ...fields, commandId, outcome: "deadline", failure, durationMs: now() - startedAt });
    return { failure: "deadline" };
  }

  async function chat(event, startedAt) {
    const raw = requestBody(event);
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return errorResponse(413, "request too large");
    let request;
    try {
      request = JSON.parse(raw);
    } catch {
      return errorResponse(400, "invalid json");
    }
    const primary = upstreamBody(request, config.primaryModel, config.reasoningEffort);
    if (!primary) return errorResponse(400, "invalid chat request");

    const attempts = [{ timeout: config.primaryTimeoutSeconds, body: primary }];
    if (config.fallbackModel) {
      attempts.push({
        timeout: config.fallbackTimeoutSeconds,
        body: { ...primary, model: config.fallbackModel },
      });
    }

    // Correlation from the server function (#482), taken over only in its expected shape: a header
    // can neither inject log lines nor carry an identity.
    const requestId = String(event.headers?.["x-trainlabs-request-id"] ?? "");
    const tenantRef = String(event.headers?.["x-trainlabs-tenant-ref"] ?? "");
    const trace = {
      id: /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(requestId) ? requestId : newId(),
      tenantRef: /^[0-9a-f]{16}$/.test(tenantRef) ? tenantRef : undefined,
    };
    const { id } = trace;
    const sealed = sealPayload(
      config.payloadKey,
      JSON.stringify({ v: 1, id, host: config.sshHost, url: config.rotatorUrl, attempts }),
      REQUEST_AAD,
    );
    const run = await runOnNode(buildRelayCommand(sealed), `tutor-relay ${id}`, trace, startedAt);
    if (run.failure) return errorResponse(...CHAT_FAILURES[run.failure]);

    const { result, commandId, durationMs } = run;
    const attempt = result.attempt === 0 ? "primary" : "fallback";
    const route = Object.fromEntries(
      ROUTE_HEADERS.filter((name) => typeof result.headers?.[name] === "string").map((name) => [
        name,
        result.headers[name],
      ]),
    );
    const tried = Array.isArray(result.tried) ? result.tried : [result];
    log({
      ...trace,
      commandId,
      outcome: result.status === 200 ? "completed" : "upstream_failed",
      attempt,
      model: result.model,
      upstreamStatus: result.status,
      upstreamError: result.error,
      failure: attemptFailure(result),
      // Every attempt with the station that failed, never with prompt or answer (#481).
      attempts: tried.map((entry) => ({
        model: String(entry?.model ?? ""),
        status: Number.isSafeInteger(entry?.status) ? entry.status : 0,
        type:
          typeof entry?.type === "string" && /^[a-z_]{1,40}$/.test(entry.type)
            ? entry.type
            : undefined,
        failure: attemptFailure(entry),
      })),
      route: route["x-ollama-route"],
      durationMs,
    });
    if (result.status !== 200 || typeof result.body !== "string") {
      return errorResponse(502, "model unavailable");
    }
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "x-tutor-relay-attempt": attempt,
        "x-tutor-relay-model": String(result.model ?? ""),
        ...route,
      },
      body: unwrapJsonFence(result.body, primary.response_format !== undefined),
    };
  }

  function healthResponse(id, startedAt, checks) {
    const status = overallHealth(checks);
    const durationMs = now() - startedAt;
    log({
      id,
      kind: "health",
      outcome: "health",
      status,
      durationMs,
      checks: healthSummary(checks),
    });
    return {
      statusCode: status === "down" ? 503 : 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ status, durationMs, checks }),
    };
  }

  async function health(startedAt) {
    const id = newId();
    const checks = { ssm: { status: "unknown" }, ...reportedChecks(undefined, config) };
    let node;
    try {
      const information = await send(
        new DescribeInstanceInformationCommand({
          Filters: [{ Key: "InstanceIds", Values: [config.instanceId] }],
        }),
      );
      node = information?.InstanceInformationList?.[0] ?? null;
    } catch {
      // Without the status call, the run command below still shows whether the node answers.
    }
    if (node !== undefined) {
      checks.ssm = {
        status: node?.PingStatus === "Online" ? "ok" : "down",
        pingStatus: node?.PingStatus ?? "NotRegistered",
        agentVersion: node?.AgentVersion,
        lastPingAt:
          node?.LastPingDateTime instanceof Date ? node.LastPingDateTime.toISOString() : undefined,
      };
      if (checks.ssm.status === "down") return healthResponse(id, startedAt, checks);
    }

    const sealed = sealPayload(
      config.payloadKey,
      JSON.stringify({
        v: 1,
        id,
        mode: "health",
        host: config.sshHost,
        url: config.rotatorUrl,
        ollama: config.ollamaUrl,
        models: { primary: config.primaryModel, fallback: config.fallbackModel },
      }),
      REQUEST_AAD,
    );
    const run = await runOnNode(
      buildHealthCommand(sealed),
      `tutor-relay health ${id}`,
      { id, kind: "health" },
      startedAt,
    );
    if (run.failure) {
      checks.ssm = { ...checks.ssm, status: "down", error: run.failure.replaceAll("_", "-") };
      return healthResponse(id, startedAt, checks);
    }
    return healthResponse(id, startedAt, {
      ssm: { ...checks.ssm, status: "ok" },
      ...reportedChecks(run.result.health, config),
    });
  }

  return async function tutorRelay(event) {
    const startedAt = now();
    const method = event?.requestContext?.http?.method;
    const path = String(event?.rawPath ?? "");
    if (path.endsWith("/health")) {
      if (method !== "GET") return errorResponse(405, "method not allowed");
      if (!authorized(event, config.bearer)) return errorResponse(401, "unauthorized");
      return health(startedAt);
    }
    if (method !== "POST") return errorResponse(405, "method not allowed");
    if (!path.endsWith("/chat/completions")) return errorResponse(404, "not found");
    if (!authorized(event, config.bearer)) return errorResponse(401, "unauthorized");
    return chat(event, startedAt);
  };
}

const client = new SSMClient({});
let relay;

export async function handler(event) {
  // Amplify resolves secrets into the environment at cold start, so the config is read lazily.
  relay ??= createTutorRelayHandler({
    send: (command) => client.send(command),
    config: loadRelayConfig(),
  });
  return relay(event);
}
