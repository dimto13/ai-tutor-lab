#!/usr/bin/env node
// Amplify Hosting passes no console environment variables to the SSR runtime (#99). This build
// step collects the server configuration from amplify_outputs.json and the TUTOR_RELAY_KEY secret
// and writes it for apps/web/vite.config.ts, which bakes it into the server entry. A missing piece
// disables the tutor LLM for this build; it never fails the build.
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { GetParameterCommand, GetParametersByPathCommand, SSMClient } from "@aws-sdk/client-ssm";
import { deriveRelayKeys } from "../amplify/functions/tutor-relay/keys.js";

const { values } = parseArgs({
  options: {
    outputs: { type: "string", default: "apps/web/public/amplify_outputs.json" },
    out: { type: "string", default: "apps/web/.runtime-env.json" },
  },
});

const outputs = JSON.parse(await readFile(values.outputs, "utf8"));
const env = {};

const auth = outputs.auth ?? {};
if (auth.user_pool_id && auth.user_pool_client_id) {
  env.COGNITO_REGION = auth.aws_region;
  env.COGNITO_USER_POOL_ID = auth.user_pool_id;
  env.COGNITO_USER_POOL_CLIENT_ID = auth.user_pool_client_id;
}

const relayUrl = outputs.custom?.tutorRelayUrl;
const masterKey = relayUrl ? await readRelaySecret() : undefined;
if (relayUrl && masterKey && process.env.LLM_ENABLED !== "false") {
  env.LLM_ENABLED = "true";
  env.LLM_BASE_URL = new URL("v1", relayUrl).toString();
  env.LLM_API_KEY = deriveRelayKeys(masterKey).bearer;
  env.LLM_MODEL = process.env.TUTOR_RELAY_PRIMARY_MODEL || "gemma4:31b";
} else {
  env.LLM_ENABLED = "false";
  const reason = !relayUrl
    ? "no tutorRelayUrl in amplify_outputs.json"
    : !masterKey
      ? "secret TUTOR_RELAY_KEY not readable"
      : "LLM_ENABLED=false";
  console.warn(`Tutor LLM disabled for this build: ${reason}`);
}

await writeFile(values.out, `${JSON.stringify(env, null, 2)}\n`, { mode: 0o600 });
console.log(`Server runtime env written (${Object.keys(env).join(", ")})`);

// Amplify keeps branch secrets at /amplify/<app-id>/<branch>-branch-<hash>/<name> and shared ones
// at /amplify/shared/<app-id>/<name>; the branch secret wins, as in the function itself.
async function readRelaySecret() {
  const appId = process.env.AWS_APP_ID;
  const branch = process.env.AWS_BRANCH;
  if (!appId) return undefined;
  const client = new SSMClient({});
  const branchSecret = branch
    ? new RegExp(`^/amplify/${appId}/${branch}-branch-[^/]+/TUTOR_RELAY_KEY$`)
    : undefined;
  try {
    let nextToken;
    do {
      const page = await client.send(
        new GetParametersByPathCommand({
          Path: `/amplify/${appId}/`,
          Recursive: true,
          WithDecryption: true,
          NextToken: nextToken,
        }),
      );
      const match = page.Parameters?.find((parameter) => branchSecret?.test(parameter.Name ?? ""));
      if (match?.Value) return match.Value;
      nextToken = page.NextToken;
    } while (nextToken);
  } catch (error) {
    console.warn(`Cannot list branch secrets: ${error?.name}`);
  }
  try {
    const { Parameter } = await client.send(
      new GetParameterCommand({
        Name: `/amplify/shared/${appId}/TUTOR_RELAY_KEY`,
        WithDecryption: true,
      }),
    );
    return Parameter?.Value || undefined;
  } catch (error) {
    if (error?.name !== "ParameterNotFound")
      console.warn(`Cannot read shared secret: ${error?.name}`);
    return undefined;
  }
}
