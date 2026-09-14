import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  CancelCommandCommand,
  DescribeInstanceInformationCommand,
  GetCommandInvocationCommand,
  SendCommandCommand,
} from "@aws-sdk/client-ssm";
import {
  attemptFailure,
  createTutorRelayHandler,
  loadRelayConfig,
  unwrapJsonFence,
  upstreamBody,
} from "../../amplify/functions/tutor-relay/handler.js";
import {
  REQUEST_AAD,
  RESPONSE_AAD,
  deriveRelayKeys,
  openPayload,
  sealPayload,
} from "../../amplify/functions/tutor-relay/keys.js";
import {
  HEALTH_PROGRAM,
  RELAY_PROGRAM,
  buildHealthCommand,
  buildRelayCommand,
} from "../../amplify/functions/tutor-relay/relayProgram.js";

const MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
const INSTANCE_ID = "mi-0c4f95e235b575da9";
const MARKER_WORD = "Zitronenfalter";
const QUESTION = `Wo finde ich den Explorer? ${MARKER_WORD}`;
const ONLINE = { InstanceInformationList: [{ PingStatus: "Online", AgentVersion: "3.3.2" }] };

interface RelayAttempt {
  timeout: number;
  body: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    reasoning_effort?: string;
    response_format?: unknown;
    max_tokens?: number;
  };
}

interface RelayRequest {
  v: number;
  id: string;
  host: string;
  url: string;
  attempts: RelayAttempt[];
  mode?: string;
  ollama?: string;
  models?: { primary: string; fallback: string };
}

interface SendInput {
  DocumentName: string;
  InstanceIds: string[];
  Parameters: { commands: string[]; executionTimeout: string[] };
  Comment: string;
}

interface HealthCheck {
  status: string;
  [field: string]: unknown;
}

interface HealthReport {
  status: string;
  checks: Record<"ssm" | "sshNas" | "rotator" | "cloudRoute" | "ollama", HealthCheck> & {
    models: { primary?: HealthCheck; fallback?: HealthCheck };
  };
}

type NodeAnswer = Record<string, unknown> | string;

const keys = deriveRelayKeys(MASTER_KEY);

const completion = JSON.stringify({
  model: "gemma4:31b",
  choices: [{ message: { content: '{"answer":"Explorer"}' } }],
});

const HEALTHY_NODE = {
  sshNas: { status: "ok" },
  rotator: { status: "ok", cloudAccounts: 3, cloudAccountsFree: 3 },
  cloudRoute: { status: "ok" },
  ollama: { status: "ok", version: "0.32.13" },
  models: { primary: { status: "ok" }, fallback: { status: "ok", loaded: true } },
};

function relayConfig(env: Record<string, string> = {}) {
  return loadRelayConfig({
    TUTOR_RELAY_KEY: MASTER_KEY,
    TUTOR_RELAY_MANAGED_INSTANCE_ID: INSTANCE_ID,
    ...env,
  });
}

function relayEvent(overrides: Record<string, unknown> = {}) {
  return {
    rawPath: "/v1/chat/completions",
    requestContext: { http: { method: "POST" } },
    headers: { authorization: `Bearer ${keys.bearer}` },
    isBase64Encoded: false,
    body: JSON.stringify({
      model: "chosen-by-caller",
      messages: [
        { role: "system", content: "Antworte als JSON." },
        { role: "user", content: QUESTION },
      ],
      temperature: 0,
      max_tokens: 500,
      response_format: { type: "json_object" },
      tools: [{ type: "function" }],
    }),
    ...overrides,
  };
}

function healthEvent(overrides: Record<string, unknown> = {}) {
  return {
    rawPath: "/v1/health",
    requestContext: { http: { method: "GET" } },
    headers: { authorization: `Bearer ${keys.bearer}` },
    isBase64Encoded: false,
    ...overrides,
  };
}

function healthReport(response: { body: string }): HealthReport {
  return JSON.parse(response.body) as HealthReport;
}

function fakeClock() {
  let current = 0;
  return {
    now: () => current,
    sleep: async (ms: number) => {
      current += ms;
    },
  };
}

function sealedRequestOf(command: string): RelayRequest {
  const match = /TRELAY_REQUEST='([A-Za-z0-9+/=]+)'/.exec(command);
  assert.ok(match, "command carries a sealed request");
  return JSON.parse(openPayload(keys.payloadKey, match[1] ?? "", REQUEST_AAD)) as RelayRequest;
}

function sealedAnswer(request: RelayRequest, result: Record<string, unknown>): string {
  const payload = JSON.stringify({ v: 1, id: request.id, ...result });
  return `agent output\nTRELAY1:${sealPayload(keys.payloadKey, payload, RESPONSE_AAD)}\n`;
}

function fakeNode(
  answer: (request: RelayRequest) => NodeAnswer,
  statuses: Array<string | Error> = [],
  information: Record<string, unknown> | Error = ONLINE,
) {
  const sent: SendInput[] = [];
  const cancelled: unknown[] = [];
  let described = 0;
  let stdout = "";

  async function send(command: unknown) {
    if (command instanceof DescribeInstanceInformationCommand) {
      described += 1;
      if (information instanceof Error) throw information;
      return information;
    }
    if (command instanceof SendCommandCommand) {
      const input = command.input as unknown as SendInput;
      sent.push(input);
      const request = sealedRequestOf(input.Parameters.commands[0] ?? "");
      const result = answer(request);
      stdout = typeof result === "string" ? result : sealedAnswer(request, result);
      return { Command: { CommandId: "command-1" } };
    }
    if (command instanceof GetCommandInvocationCommand) {
      const next = statuses.shift();
      if (next instanceof Error) throw next;
      if (next) return { Status: next };
      return { Status: "Success", StandardOutputContent: stdout };
    }
    if (command instanceof CancelCommandCommand) {
      cancelled.push(command.input);
      return {};
    }
    throw new Error("unexpected SSM command");
  }

  return { send, sent, cancelled, described: () => described };
}

function namedError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

async function capturedLogs<T>(run: () => Promise<T>): Promise<{ value: T; logs: string[] }> {
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    return { value: await run(), logs };
  } finally {
    console.log = original;
  }
}

test("one relay secret yields a distinct bearer and payload key", () => {
  assert.equal(deriveRelayKeys(MASTER_KEY).bearer, keys.bearer);
  assert.equal(keys.payloadKey.length, 32);
  assert.notEqual(
    Buffer.from(keys.bearer, "base64url").toString("hex"),
    keys.payloadKey.toString("hex"),
  );
  assert.throws(() => deriveRelayKeys(Buffer.alloc(16).toString("base64")));
});

test("sealed payloads only open for their direction", () => {
  const token = sealPayload(keys.payloadKey, "hallo", REQUEST_AAD);
  assert.equal(openPayload(keys.payloadKey, token, REQUEST_AAD), "hallo");
  assert.throws(() => openPayload(keys.payloadKey, token, RESPONSE_AAD));
});

test("the relay rejects invalid requests before touching SSM", async () => {
  const node = fakeNode(() => ({}));
  const relay = createTutorRelayHandler({ send: node.send, config: relayConfig() });
  const cases: Array<[Record<string, unknown>, number]> = [
    [{ requestContext: { http: { method: "GET" } } }, 405],
    [{ rawPath: "/v1/models" }, 404],
    [{ headers: { authorization: "Bearer falsch" } }, 401],
    [{ headers: {} }, 401],
    [{ body: "{" }, 400],
    [{ body: JSON.stringify({ messages: [{ role: "tool", content: "x" }] }) }, 400],
    [{ body: JSON.stringify({ messages: [] }) }, 400],
    [{ body: "x".repeat(65 * 1024) }, 413],
  ];
  for (const [overrides, status] of cases) {
    const response = await relay(relayEvent(overrides));
    assert.equal(response.statusCode, status, JSON.stringify(overrides).slice(0, 80));
  }
  assert.equal(node.sent.length, 0);
});

test("the relay seals the prompt and runs AWS-RunShellScript only on the RMI-PC", async () => {
  const node = fakeNode(
    () => ({
      status: 200,
      attempt: 0,
      model: "gemma4:31b",
      headers: { "x-ollama-route": "cloud" },
      body: completion,
    }),
    [namedError("InvocationDoesNotExist"), "InProgress"],
  );
  const relay = createTutorRelayHandler({ send: node.send, config: relayConfig(), ...fakeClock() });

  const response = await relay(relayEvent());

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, completion);
  assert.equal(response.headers["x-tutor-relay-attempt"], "primary");
  assert.equal(response.headers["x-ollama-route"], "cloud");

  const [input] = node.sent;
  assert.ok(input);
  assert.equal(input.DocumentName, "AWS-RunShellScript");
  assert.deepEqual(input.InstanceIds, [INSTANCE_ID]);
  const command = input.Parameters.commands[0] ?? "";
  assert.equal(command.includes(MARKER_WORD), false, "the prompt must not appear in the command");
  assert.equal(input.Comment.includes(MARKER_WORD), false);
  assert.match(
    command,
    /^set -eu\nexport TRELAY_REQUEST='[A-Za-z0-9+/=]+'\nexec \/usr\/bin\/python3 - <<'TRELAY_PY'\n/,
  );

  const request = sealedRequestOf(command);
  assert.equal(request.host, "nas");
  assert.equal(request.url, "http://localhost:11435/v1/chat/completions");
  assert.deepEqual(
    request.attempts.map((attempt) => attempt.body.model),
    ["gemma4:31b", "gemma4:e4b@local"],
  );
  const [primary] = request.attempts;
  assert.ok(primary);
  assert.equal(primary.body.messages[1]?.content, QUESTION);
  assert.equal("reasoning_effort" in primary.body, false, "the model keeps its reasoning step");
  assert.deepEqual(primary.body.response_format, { type: "json_object" });
  assert.equal(primary.body.max_tokens, 500);
  assert.equal("tools" in primary.body, false, "unsupported fields are dropped");
});

test("a throttled status call keeps the relay polling", async () => {
  const node = fakeNode(
    () => ({ status: 200, attempt: 0, headers: {}, body: completion }),
    [namedError("ThrottlingException"), "InProgress"],
  );
  const relay = createTutorRelayHandler({ send: node.send, config: relayConfig(), ...fakeClock() });
  assert.equal((await relay(relayEvent())).statusCode, 200);
});

test("only the server entry reads the baked server environment", async () => {
  const sourceRoot = path.resolve("apps/web/src");
  const serverEntry = path.join(sourceRoot, "server.ts");
  const readers: string[] = [];
  for (const entry of await readdir(sourceRoot, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(tsx?|jsx?|mjs)$/.test(entry.name)) continue;
    const file = path.join(entry.parentPath, entry.name);
    if ((await readFile(file, "utf8")).includes("__TRAINLABS_SERVER_ENV__")) readers.push(file);
  }
  // The build substitutes the constant wherever it appears; any client module would ship the bearer.
  assert.deepEqual(readers, [serverEntry]);
});

test("the relay reports an answer from the fallback attempt", async () => {
  const node = fakeNode(() => ({
    status: 200,
    attempt: 1,
    model: "gemma4:e4b@local",
    headers: { "x-ollama-route": "local:gemma4:e4b" },
    body: completion,
  }));
  const relay = createTutorRelayHandler({ send: node.send, config: relayConfig(), ...fakeClock() });
  const response = await relay(relayEvent());
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-tutor-relay-attempt"], "fallback");
  assert.equal(response.headers["x-tutor-relay-model"], "gemma4:e4b@local");
});

test("a configured reasoning effort reaches both attempts", async () => {
  const node = fakeNode(() => ({ status: 200, attempt: 0, headers: {}, body: completion }));
  const relay = createTutorRelayHandler({
    send: node.send,
    config: relayConfig({ TUTOR_RELAY_REASONING_EFFORT: "low" }),
    ...fakeClock(),
  });
  await relay(relayEvent());
  const request = sealedRequestOf(node.sent[0]?.Parameters.commands[0] ?? "");
  assert.deepEqual(
    request.attempts.map((attempt) => attempt.body.reasoning_effort),
    ["low", "low"],
  );
});

test("an empty fallback model disables the second attempt", async () => {
  const node = fakeNode(() => ({ status: 200, attempt: 0, headers: {}, body: completion }));
  const relay = createTutorRelayHandler({
    send: node.send,
    config: relayConfig({ TUTOR_RELAY_FALLBACK_MODEL: "" }),
    ...fakeClock(),
  });
  await relay(relayEvent());
  assert.equal(sealedRequestOf(node.sent[0]?.Parameters.commands[0] ?? "").attempts.length, 1);
});

test("node errors, foreign answers and failed models become 502 without prompt echo", async () => {
  const answers: Array<(request: RelayRequest) => NodeAnswer> = [
    () => "TRELAYERR:key-not-unique\n",
    () => "no marker\n",
    (request) => sealedAnswer({ ...request, id: "another-request" }, { status: 200, body: "{}" }),
    () => ({ status: 503, attempt: 1, model: "gemma4:e4b@local", headers: {}, body: "busy" }),
    () => ({ status: 0, attempt: 1, model: "gemma4:e4b@local", error: "timeout" }),
  ];
  for (const answer of answers) {
    const node = fakeNode(answer);
    const relay = createTutorRelayHandler({
      send: node.send,
      config: relayConfig(),
      ...fakeClock(),
    });
    const response = await relay(relayEvent());
    assert.equal(response.statusCode, 502);
    assert.equal(response.body.includes(MARKER_WORD), false);
  }
});

test("the relay answers 503 when SSM refuses the command", async () => {
  const relay = createTutorRelayHandler({
    send: async () => {
      throw namedError("AccessDeniedException");
    },
    config: relayConfig(),
    ...fakeClock(),
  });
  assert.equal((await relay(relayEvent())).statusCode, 503);
});

test("the relay cancels the command and answers 504 at its deadline", async () => {
  const clock = fakeClock();
  const node = fakeNode(
    () => ({ status: 200, attempt: 0, body: completion }),
    Array.from({ length: 200 }, () => "InProgress"),
  );
  const relay = createTutorRelayHandler({ send: node.send, config: relayConfig(), ...clock });
  const response = await relay(relayEvent());
  assert.equal(response.statusCode, 504);
  assert.equal(node.cancelled.length, 1);
  assert.ok(clock.now() < 22_000, "the relay stays inside its deadline");
});

test("the health call checks method and bearer before asking SSM", async () => {
  const node = fakeNode(() => ({ health: HEALTHY_NODE }));
  const relay = createTutorRelayHandler({ send: node.send, config: relayConfig() });
  assert.equal((await relay(healthEvent({ headers: {} }))).statusCode, 401);
  assert.equal(
    (await relay(healthEvent({ headers: { authorization: "Bearer falsch" } }))).statusCode,
    401,
  );
  assert.equal(
    (await relay(healthEvent({ requestContext: { http: { method: "POST" } } }))).statusCode,
    405,
  );
  assert.equal(node.described(), 0);
  assert.equal(node.sent.length, 0);
});

test("an offline managed node is reported without a run command", async () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [
      { InstanceInformationList: [{ PingStatus: "ConnectionLost", AgentVersion: "3.3.2" }] },
      "ConnectionLost",
    ],
    [{ InstanceInformationList: [] }, "NotRegistered"],
  ];
  for (const [information, pingStatus] of cases) {
    const node = fakeNode(() => ({ health: HEALTHY_NODE }), [], information);
    const clock = fakeClock();
    const relay = createTutorRelayHandler({ send: node.send, config: relayConfig(), ...clock });
    const response = await relay(healthEvent());
    assert.equal(response.statusCode, 503);
    const report = healthReport(response);
    assert.equal(report.status, "down");
    assert.equal(report.checks.ssm.status, "down");
    assert.equal(report.checks.ssm.pingStatus, pingStatus);
    assert.equal(report.checks.sshNas.status, "unknown");
    assert.equal(node.sent.length, 0);
    assert.equal(clock.now(), 0, "the answer does not wait for a command");
  }
});

test("the health call runs the sealed health program on the RMI-PC", async () => {
  const node = fakeNode(
    () => ({ health: HEALTHY_NODE }),
    [namedError("InvocationDoesNotExist"), "InProgress"],
  );
  const relay = createTutorRelayHandler({
    send: node.send,
    config: relayConfig(),
    ...fakeClock(),
    newId: () => "health-1",
  });

  const response = await relay(healthEvent());

  assert.equal(response.statusCode, 200);
  const report = healthReport(response);
  assert.equal(report.status, "ok");
  assert.deepEqual(report.checks.ssm, {
    status: "ok",
    pingStatus: "Online",
    agentVersion: "3.3.2",
  });
  assert.deepEqual(report.checks.rotator, { status: "ok", cloudAccounts: 3, cloudAccountsFree: 3 });
  assert.deepEqual(report.checks.models.primary, {
    name: "gemma4:31b",
    route: "cloud",
    status: "ok",
  });
  assert.deepEqual(report.checks.models.fallback, {
    name: "gemma4:e4b@local",
    route: "local",
    status: "ok",
    loaded: true,
  });

  const [input] = node.sent;
  assert.ok(input);
  assert.deepEqual(input.InstanceIds, [INSTANCE_ID]);
  assert.equal(input.Comment, "tutor-relay health health-1");
  const command = input.Parameters.commands[0] ?? "";
  assert.ok(command.includes(HEALTH_PROGRAM), "the fixed health program runs");
  const request = sealedRequestOf(command);
  assert.equal(request.mode, "health");
  assert.equal(request.host, "nas");
  assert.equal(request.url, "http://localhost:11435/v1/chat/completions");
  assert.equal(request.ollama, "http://localhost:11434");
  assert.deepEqual(request.models, { primary: "gemma4:31b", fallback: "gemma4:e4b@local" });
});

test("health degrades while one model route works and is down without one", async () => {
  const cases: Array<[Record<string, unknown>, string, number]> = [
    [{ cloudRoute: { status: "degraded", error: "accounts-limited" } }, "degraded", 200],
    [
      {
        ollama: { status: "down" },
        models: { primary: { status: "ok" }, fallback: { status: "unknown" } },
      },
      "degraded",
      200,
    ],
    [
      {
        sshNas: { status: "down", error: "transport-exit-255" },
        rotator: { status: "unknown" },
        cloudRoute: { status: "unknown" },
      },
      "down",
      503,
    ],
    [
      {
        models: { primary: { status: "missing" }, fallback: { status: "missing", loaded: false } },
      },
      "down",
      503,
    ],
  ];
  for (const [change, status, statusCode] of cases) {
    const node = fakeNode(() => ({ health: { ...HEALTHY_NODE, ...change } }));
    const relay = createTutorRelayHandler({
      send: node.send,
      config: relayConfig(),
      ...fakeClock(),
    });
    const response = await relay(healthEvent());
    assert.equal(response.statusCode, statusCode, JSON.stringify(change));
    assert.equal(healthReport(response).status, status, JSON.stringify(change));
  }
});

test("only known health fields reach the answer and the log", async () => {
  const leak = "OLLAMA_KONTO_GEHEIM";
  const node = fakeNode(() => ({
    health: {
      ...HEALTHY_NODE,
      rotator: {
        status: "ok",
        cloudAccounts: 3,
        cloudAccountsFree: 2,
        konten: [{ name: leak, key_ende: "Xy12" }],
      },
      ollama: { status: "ok", version: `0.32.13 ${leak}` },
      models: {
        primary: { status: "ok", name: leak },
        fallback: { status: "fine", loaded: "yes" },
      },
      extra: leak,
    },
  }));
  const relay = createTutorRelayHandler({ send: node.send, config: relayConfig(), ...fakeClock() });

  const { value: response, logs } = await capturedLogs(() => relay(healthEvent()));

  for (const text of [response.body, ...logs]) {
    assert.equal(text.includes(leak), false);
    assert.equal(text.includes("Xy12"), false);
  }
  const report = healthReport(response);
  assert.deepEqual(report.checks.rotator, { status: "ok", cloudAccounts: 3, cloudAccountsFree: 2 });
  assert.deepEqual(report.checks.ollama, { status: "ok" });
  assert.deepEqual(report.checks.models.fallback, {
    name: "gemma4:e4b@local",
    route: "local",
    status: "unknown",
  });
});

test("a failed health run marks the SSM hop down, a missing status call does not", async () => {
  const failed = fakeNode(() => "TRELAYERR:key-not-unique\n");
  let relay = createTutorRelayHandler({ send: failed.send, config: relayConfig(), ...fakeClock() });
  let response = await relay(healthEvent());
  assert.equal(response.statusCode, 503);
  assert.deepEqual(healthReport(response).checks.ssm, {
    status: "down",
    pingStatus: "Online",
    agentVersion: "3.3.2",
    error: "output-unusable",
  });

  const denied = fakeNode(
    () => ({ health: HEALTHY_NODE }),
    [],
    namedError("AccessDeniedException"),
  );
  relay = createTutorRelayHandler({ send: denied.send, config: relayConfig(), ...fakeClock() });
  response = await relay(healthEvent());
  assert.equal(response.statusCode, 200);
  assert.deepEqual(healthReport(response).checks.ssm, { status: "ok" });
});

test("health only counts the stations the configured models use", async () => {
  const cases: Array<[Record<string, string>, Record<string, unknown>]> = [
    [
      { TUTOR_RELAY_FALLBACK_MODEL: "" },
      { ollama: { status: "down" }, models: { primary: { status: "ok" } } },
    ],
    [
      { TUTOR_RELAY_PRIMARY_MODEL: "gemma4:e4b@local", TUTOR_RELAY_FALLBACK_MODEL: "" },
      {
        cloudRoute: { status: "down", httpStatus: 0 },
        models: { primary: { status: "ok", loaded: true } },
      },
    ],
  ];
  for (const [env, change] of cases) {
    const node = fakeNode(() => ({ health: { ...HEALTHY_NODE, ...change } }));
    const relay = createTutorRelayHandler({
      send: node.send,
      config: relayConfig(env),
      ...fakeClock(),
    });
    const response = await relay(healthEvent());
    assert.equal(response.statusCode, 200, JSON.stringify(env));
    assert.equal(healthReport(response).status, "ok", JSON.stringify(env));
  }
});

test("the Ollama URL of the health check tolerates a trailing slash", () => {
  assert.equal(
    relayConfig({ TUTOR_RELAY_OLLAMA_URL: "http://localhost:11434/" }).ollamaUrl,
    "http://localhost:11434",
  );
});

test("the node commands only accept a base64 token", () => {
  assert.throws(() => buildRelayCommand("abc'; rm -rf /; echo '"));
  assert.throws(() => buildHealthCommand("abc'; rm -rf /; echo '"));
  for (const program of [RELAY_PROGRAM, HEALTH_PROGRAM]) {
    assert.equal(program.split("\n").includes("TRELAY_PY"), false);
  }
});

test("a fenced JSON answer is unwrapped only when JSON was requested", () => {
  const fenced = JSON.stringify({
    model: "gemma4:31b",
    choices: [{ message: { content: '```json\n{\n  "answer": "Explorer"\n}\n```' } }],
  });
  const unwrapped = JSON.parse(unwrapJsonFence(fenced, true)) as {
    choices: Array<{ message: { content: string } }>;
  };
  assert.deepEqual(JSON.parse(unwrapped.choices[0]?.message.content ?? ""), { answer: "Explorer" });
  assert.equal(unwrapJsonFence(fenced, false), fenced);
  assert.equal(unwrapJsonFence(completion, true), completion);
  assert.equal(unwrapJsonFence("not json", true), "not json");
});

test("only supported chat fields reach the rotator", () => {
  assert.equal(upstreamBody({ messages: "nope" }, "m", "none"), null);
  assert.deepEqual(
    upstreamBody({ messages: [{ role: "user", content: "hi" }], temperature: 9 }, "m", ""),
    { model: "m", messages: [{ role: "user", content: "hi" }], stream: false },
  );
});

function relayLog(logs: string[]): Record<string, unknown> {
  const entry = logs
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .reverse()
    .find((line) => line["component"] === "tutor-relay");
  assert.ok(entry, "the relay logs the request");
  return entry;
}

test("every failed attempt is named by the station that failed", () => {
  const cases: Array<[Record<string, unknown>, string | undefined]> = [
    [{ status: 200, model: "gemma4:31b" }, undefined],
    [{ status: 0, error: "transport-exit-255" }, "nas_unreachable"],
    [{ status: 0, error: "transport-exit-7" }, "rotator_offline"],
    [{ status: 0, error: "transport-exit-52" }, "rotator_offline"],
    [{ status: 0, error: "timeout" }, "timeout"],
    [{ status: 0, error: "transport-exit-28" }, "timeout"],
    [{ status: 0, error: "transport-exit-6" }, "transport_error"],
    [{ status: 0 }, "transport_error"],
    [{ status: 429, model: "gemma4:31b" }, "busy"],
    [{ status: 503, model: "gemma4:31b" }, "cloud_unavailable"],
    [{ status: 502, model: "gemma4:e4b@local" }, "local_unavailable"],
    [{ status: 400, model: "gemma4:31b", type: "model_not_allowed" }, "provider_error"],
    [{ status: 404, model: "missing@local", type: "not_found_error" }, "provider_error"],
  ];
  for (const [attempt, failure] of cases) {
    assert.equal(attemptFailure(attempt), failure, JSON.stringify(attempt));
  }
});

test("the relay log names the failure of every attempt without prompt content", async () => {
  const both = (first: Record<string, unknown>, second: Record<string, unknown>) => [
    { model: "gemma4:31b", ...first },
    { model: "gemma4:e4b@local", ...second },
  ];
  const cases: Array<
    [string, Record<string, unknown>, number, string | undefined, Array<string | undefined>]
  > = [
    [
      "cloud busy, local answers",
      {
        status: 200,
        attempt: 1,
        model: "gemma4:e4b@local",
        headers: {},
        body: completion,
        tried: both({ status: 429 }, { status: 200 }),
      },
      200,
      undefined,
      ["busy", undefined],
    ],
    [
      "cloud and local unavailable",
      {
        status: 502,
        attempt: 1,
        model: "gemma4:e4b@local",
        headers: {},
        body: "{}",
        tried: both({ status: 503 }, { status: 502 }),
      },
      502,
      "local_unavailable",
      ["cloud_unavailable", "local_unavailable"],
    ],
    [
      "NAS unreachable",
      {
        status: 0,
        attempt: 1,
        model: "gemma4:e4b@local",
        error: "transport-exit-255",
        tried: both(
          { status: 0, error: "transport-exit-255" },
          { status: 0, error: "transport-exit-255" },
        ),
      },
      502,
      "nas_unreachable",
      ["nas_unreachable", "nas_unreachable"],
    ],
    [
      "rotator offline",
      {
        status: 0,
        attempt: 1,
        model: "gemma4:e4b@local",
        error: "transport-exit-7",
        tried: both(
          { status: 0, error: "transport-exit-7" },
          { status: 0, error: "transport-exit-7" },
        ),
      },
      502,
      "rotator_offline",
      ["rotator_offline", "rotator_offline"],
    ],
    [
      "timeouts",
      {
        status: 0,
        attempt: 1,
        model: "gemma4:e4b@local",
        error: "transport-exit-28",
        tried: both({ status: 0, error: "timeout" }, { status: 0, error: "transport-exit-28" }),
      },
      502,
      "timeout",
      ["timeout", "timeout"],
    ],
    [
      "provider errors",
      {
        status: 404,
        attempt: 1,
        model: "gemma4:e4b@local",
        headers: {},
        body: "{}",
        type: "not_found_error",
        tried: both(
          { status: 400, type: "model_not_allowed" },
          { status: 404, type: "not_found_error" },
        ),
      },
      502,
      "provider_error",
      ["provider_error", "provider_error"],
    ],
  ];
  for (const [name, result, statusCode, failure, attemptFailures] of cases) {
    const node = fakeNode(() => result);
    const relay = createTutorRelayHandler({
      send: node.send,
      config: relayConfig(),
      ...fakeClock(),
    });
    const { value: response, logs } = await capturedLogs(() => relay(relayEvent()));
    assert.equal(response.statusCode, statusCode, name);
    const entry = relayLog(logs);
    assert.equal(entry["failure"], failure, name);
    assert.deepEqual(
      (entry["attempts"] as Array<{ failure?: string }>).map((attempt) => attempt.failure),
      attemptFailures,
      name,
    );
    assert.equal(logs.join("\n").includes(MARKER_WORD), false, name);
  }
});

test("SSM and node failures are named in the relay log", async () => {
  const invocationOf =
    (invocation: Record<string, unknown>) =>
    async (command: unknown): Promise<unknown> => {
      if (command instanceof SendCommandCommand) return { Command: { CommandId: "command-1" } };
      if (command instanceof GetCommandInvocationCommand) return invocation;
      return {};
    };
  const refusing = (name: string) => async (): Promise<unknown> => {
    throw namedError(name);
  };
  const cases: Array<[string, (command: unknown) => Promise<unknown>, number, string]> = [
    ["node not registered", refusing("InvalidInstanceId"), 503, "node_offline"],
    ["SSM refuses", refusing("AccessDeniedException"), 503, "ssm_error"],
    [
      "undeliverable",
      invocationOf({ Status: "Failed", StatusDetails: "Undeliverable" }),
      502,
      "node_offline",
    ],
    [
      "execution timed out",
      invocationOf({ Status: "TimedOut", StatusDetails: "ExecutionTimedOut" }),
      502,
      "timeout",
    ],
    [
      "program failed",
      invocationOf({ Status: "Failed", StatusDetails: "Failed" }),
      502,
      "relay_node_error",
    ],
    ["never started", invocationOf({ Status: "Pending" }), 504, "node_offline"],
    ["still running", invocationOf({ Status: "InProgress" }), 504, "timeout"],
    [
      "node program error",
      fakeNode(() => "TRELAYERR:key-permissions\n").send,
      502,
      "relay_node_error",
    ],
  ];
  for (const [name, send, statusCode, failure] of cases) {
    const relay = createTutorRelayHandler({ send, config: relayConfig(), ...fakeClock() });
    const { value: response, logs } = await capturedLogs(() => relay(relayEvent()));
    assert.equal(response.statusCode, statusCode, name);
    assert.equal(relayLog(logs)["failure"], failure, name);
  }
});

test("the relay keeps the caller's request ID and tenant reference only in their shape", async () => {
  const requestId = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const cases: Array<[Record<string, string>, string, string | undefined]> = [
    [
      { "x-trainlabs-request-id": requestId, "x-trainlabs-tenant-ref": "0123456789abcdef" },
      requestId,
      "0123456789abcdef",
    ],
    [
      {
        "x-trainlabs-request-id": `${requestId}\n{"component":"tutor-relay","outcome":"forged"}`,
        "x-trainlabs-tenant-ref": "personal:7a1f2c3d-subject",
      },
      "relay-own-id",
      undefined,
    ],
  ];
  for (const [headers, id, tenantRef] of cases) {
    const node = fakeNode(() => ({
      status: 200,
      attempt: 0,
      model: "gemma4:31b",
      headers: {},
      body: completion,
    }));
    const relay = createTutorRelayHandler({
      send: node.send,
      config: relayConfig(),
      ...fakeClock(),
      newId: () => "relay-own-id",
    });
    const { logs } = await capturedLogs(() =>
      relay(relayEvent({ headers: { authorization: `Bearer ${keys.bearer}`, ...headers } })),
    );
    assert.equal(logs.length, 1, "no forged log line");
    const entry = relayLog(logs);
    assert.equal(entry["id"], id);
    assert.equal(entry["tenantRef"], tenantRef);
    assert.equal(node.sent[0]?.Comment, `tutor-relay ${id}`);
    assert.equal(logs[0]?.includes("personal:"), false);
  }
});
