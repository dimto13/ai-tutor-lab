import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  CancelCommandCommand,
  GetCommandInvocationCommand,
  SendCommandCommand,
} from "@aws-sdk/client-ssm";
import {
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
  RELAY_PROGRAM,
  buildRelayCommand,
} from "../../amplify/functions/tutor-relay/relayProgram.js";

const MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
const INSTANCE_ID = "mi-0c4f95e235b575da9";
const MARKER_WORD = "Zitronenfalter";
const QUESTION = `Wo finde ich den Explorer? ${MARKER_WORD}`;

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
}

interface SendInput {
  DocumentName: string;
  InstanceIds: string[];
  Parameters: { commands: string[]; executionTimeout: string[] };
  Comment: string;
}

type NodeAnswer = Record<string, unknown> | string;

const keys = deriveRelayKeys(MASTER_KEY);

const completion = JSON.stringify({
  model: "gemma4:31b",
  choices: [{ message: { content: '{"answer":"Explorer"}' } }],
});

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
) {
  const sent: SendInput[] = [];
  const cancelled: unknown[] = [];
  let stdout = "";

  async function send(command: unknown) {
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

  return { send, sent, cancelled };
}

function namedError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
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

test("the relay command only accepts a base64 token", () => {
  assert.throws(() => buildRelayCommand("abc'; rm -rf /; echo '"));
  assert.equal(RELAY_PROGRAM.split("\n").includes("TRELAY_PY"), false);
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
