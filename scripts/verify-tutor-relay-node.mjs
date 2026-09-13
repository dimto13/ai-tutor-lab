#!/usr/bin/env node
// Local check for the tutor relay (#99) on the RMI-PC; not part of `npm run check`.
// Runs the relay handler with a stand-in for SSM that executes the command locally as the current
// user: sealed request → relay program → SSH to the NAS → ollama-rotator → sealed answer.
//
//   node scripts/verify-tutor-relay-node.mjs [--scenario default|fallback|local] [--serve 8787]
//
// With --serve the relay listens on 127.0.0.1, so `npm run verify:llm-live` can drive the tutor
// chain against it with the LLM_BASE_URL and LLM_API_KEY printed on start.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  createTutorRelayHandler,
  loadRelayConfig,
} from "../amplify/functions/tutor-relay/handler.js";
import { deriveRelayKeys } from "../amplify/functions/tutor-relay/keys.js";

const { values } = parseArgs({
  options: {
    scenario: { type: "string", default: "default" },
    serve: { type: "string" },
  },
});

const scenarios = {
  default: {},
  // The rotator rejects an unknown cloud model, so the relay has to fall back to the RMI-PC.
  fallback: { TUTOR_RELAY_PRIMARY_MODEL: "trainlabs-unknown-cloud-model" },
  local: { TUTOR_RELAY_PRIMARY_MODEL: "gemma4:e4b@local", TUTOR_RELAY_FALLBACK_MODEL: "" },
};
const scenarioEnv = scenarios[values.scenario];
if (!scenarioEnv) throw new Error(`Unknown scenario: ${values.scenario}`);

const masterKey =
  process.env.TUTOR_RELAY_KEY ??
  (await readFile(join(homedir(), ".config/trainlabs-tutor-relay/master.key"), "utf8")).trim();
const config = loadRelayConfig({
  ...process.env,
  TUTOR_RELAY_KEY: masterKey,
  TUTOR_RELAY_MANAGED_INSTANCE_ID: "mi-0c4f95e235b575da9",
  ...scenarioEnv,
});
const { bearer } = deriveRelayKeys(masterKey);

function runLocally(script) {
  return new Promise((resolve, reject) => {
    execFile("/bin/sh", ["-c", script], { timeout: 60_000, maxBuffer: 4 << 20 }, (error, out) =>
      error ? reject(error) : resolve(out),
    );
  });
}

// Stand-in for the SSM agent: the command runs synchronously, the invocation then reports it.
let stdout = "";
async function localSsm(command) {
  switch (command.constructor.name) {
    case "SendCommandCommand":
      stdout = await runLocally(command.input.Parameters.commands[0]);
      return { Command: { CommandId: "local" } };
    case "GetCommandInvocationCommand":
      return { Status: "Success", StandardOutputContent: stdout };
    default:
      return {};
  }
}

const relay = createTutorRelayHandler({ send: localSsm, config });

function relayEvent(method, path, authorization, body) {
  return {
    rawPath: path,
    requestContext: { http: { method } },
    headers: { authorization },
    body,
    isBase64Encoded: false,
  };
}

if (values.serve) {
  const port = Number(values.serve);
  createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const answer = await relay(
      relayEvent(
        request.method,
        request.url ?? "",
        request.headers.authorization ?? "",
        Buffer.concat(chunks).toString("utf8"),
      ),
    );
    response.writeHead(answer.statusCode, answer.headers);
    response.end(answer.body);
  }).listen(port, "127.0.0.1", () => {
    console.log(`Relay (${values.scenario}) auf http://127.0.0.1:${port}/v1`);
    console.log(`LLM_BASE_URL=http://127.0.0.1:${port}/v1 LLM_API_KEY=${bearer}`);
  });
} else {
  const startedAt = Date.now();
  const answer = await relay(
    relayEvent(
      "POST",
      "/v1/chat/completions",
      `Bearer ${bearer}`,
      JSON.stringify({
        messages: [
          {
            role: "system",
            content: "Antworte ausschließlich als JSON-Objekt mit dem Feld answer.",
          },
          { role: "user", content: "Wo öffne ich in VS Code den Explorer?" },
        ],
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
    ),
  );
  console.log(
    `Szenario ${values.scenario}: HTTP ${answer.statusCode} in ${Date.now() - startedAt} ms`,
  );
  for (const [name, value] of Object.entries(answer.headers)) {
    if (name.startsWith("x-") || name === "via") console.log(`  ${name}: ${value}`);
  }
  console.log(
    answer.statusCode === 200
      ? JSON.parse(answer.body).choices?.[0]?.message?.content
      : answer.body,
  );
  process.exitCode = answer.statusCode === 200 ? 0 : 1;
}
