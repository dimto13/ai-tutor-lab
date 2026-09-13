import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  CancelCommandCommand,
  GetCommandInvocationCommand,
  SendCommandCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import { REQUEST_AAD, RESPONSE_AAD, deriveRelayKeys, openPayload, sealPayload } from "./keys.js";
import { buildRelayCommand } from "./relayProgram.js";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES = 50;
const MAX_OUTPUT_TOKENS = 4096;
const ROLES = new Set(["system", "user", "assistant"]);
const PENDING_STATUSES = new Set(["Pending", "InProgress", "Delayed"]);
const ROUTE_HEADERS = ["x-ollama-route", "x-ollama-account", "via"];

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
  return async function tutorRelay(event) {
    const startedAt = now();
    if (event?.requestContext?.http?.method !== "POST") {
      return errorResponse(405, "method not allowed");
    }
    if (!String(event.rawPath ?? "").endsWith("/chat/completions")) {
      return errorResponse(404, "not found");
    }
    if (!authorized(event, config.bearer)) return errorResponse(401, "unauthorized");

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

    const id = newId();
    const sealed = sealPayload(
      config.payloadKey,
      JSON.stringify({ v: 1, id, host: config.sshHost, url: config.rotatorUrl, attempts }),
      REQUEST_AAD,
    );
    const deadline = startedAt + config.deadlineMs;

    let commandId;
    try {
      const sent = await send(
        new SendCommandCommand({
          DocumentName: "AWS-RunShellScript",
          InstanceIds: [config.instanceId],
          Parameters: {
            commands: [buildRelayCommand(sealed)],
            executionTimeout: [String(Math.ceil(config.deadlineMs / 1000))],
          },
          TimeoutSeconds: 30,
          Comment: `tutor-relay ${id}`,
        }),
      );
      commandId = sent?.Command?.CommandId;
    } catch (error) {
      log({ id, outcome: "send_failed", error: error?.name ?? "unknown" });
      return errorResponse(503, "relay node unavailable");
    }
    if (!commandId) {
      log({ id, outcome: "send_failed", error: "no_command_id" });
      return errorResponse(503, "relay node unavailable");
    }

    let delay = 400;
    while (now() + delay < deadline) {
      await sleep(delay);
      delay = Math.min(delay + 300, 1000);
      let invocation;
      try {
        invocation = await send(
          new GetCommandInvocationCommand({ CommandId: commandId, InstanceId: config.instanceId }),
        );
      } catch (error) {
        if (error?.name === "InvocationDoesNotExist") continue;
        log({ id, commandId, outcome: "status_failed", error: error?.name ?? "unknown" });
        return errorResponse(502, "relay status unavailable");
      }
      if (PENDING_STATUSES.has(invocation?.Status)) continue;

      const durationMs = now() - startedAt;
      if (invocation?.Status !== "Success") {
        log({ id, commandId, outcome: "command_failed", status: invocation?.Status, durationMs });
        return errorResponse(502, "relay command failed");
      }
      const { result, error } = relayResult(invocation.StandardOutputContent ?? "", config, id);
      if (error) {
        log({ id, commandId, outcome: error, durationMs });
        return errorResponse(502, "relay output unusable");
      }
      const attempt = result.attempt === 0 ? "primary" : "fallback";
      const route = Object.fromEntries(
        ROUTE_HEADERS.filter((name) => typeof result.headers?.[name] === "string").map((name) => [
          name,
          result.headers[name],
        ]),
      );
      log({
        id,
        commandId,
        outcome: result.status === 200 ? "completed" : "upstream_failed",
        attempt,
        model: result.model,
        upstreamStatus: result.status,
        upstreamError: result.error,
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

    try {
      await send(
        new CancelCommandCommand({ CommandId: commandId, InstanceIds: [config.instanceId] }),
      );
    } catch {
      // The command times out on the node on its own; cancelling is best effort.
    }
    log({ id, commandId, outcome: "deadline", durationMs: now() - startedAt });
    return errorResponse(504, "relay deadline exceeded");
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
