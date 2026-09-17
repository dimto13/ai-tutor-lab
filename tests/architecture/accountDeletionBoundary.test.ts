import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createAccountDeletionHandler } from "../../amplify/functions/account-deletion/handler.js";

const ENVIRONMENTS = [
  "USER_PROFILE_TABLE_NAME",
  "USER_PREFERENCES_TABLE_NAME",
  "TRAINING_SESSION_TABLE_NAME",
  "STEP_STATE_TABLE_NAME",
  "RUNTIME_SNAPSHOT_TABLE_NAME",
  "HINT_USAGE_TABLE_NAME",
  "ATTEMPT_TABLE_NAME",
  "SCENARIO_RUN_TABLE_NAME",
  "SCORE_EVENT_TABLE_NAME",
  "SKILL_PROFILE_TABLE_NAME",
  "ATTESTATION_TABLE_NAME",
  "TELEMETRY_DELETION_POINTER_TABLE_NAME",
  "TELEMETRY_RAW_EVENT_TABLE_NAME",
  "USER_POOL_ID",
] as const;

function configureEnvironment() {
  for (const name of ENVIRONMENTS) process.env[name] = name.toLowerCase();
}

function event(argumentsValue: Record<string, unknown> = {}) {
  return {
    arguments: argumentsValue,
    identity: {
      sub: "user-a",
      groups: ["tenant:tenant-a"],
      claims: { sub: "user-a" },
    },
  };
}

afterEach(() => {
  for (const name of ENVIRONMENTS) delete process.env[name];
});

describe("account deletion authority boundary", () => {
  it("exposes a no-argument authenticated deleteMyAccount mutation through the account-deletion function", () => {
    const rootSchema = readFileSync("amplify/data/resource.ts", "utf8");
    const extensionSchema = readFileSync("amplify/data/beta-feedback-schema.ts", "utf8");
    expect(rootSchema).toContain("...betaFeedbackSchema");
    expect(extensionSchema).toContain(
      'import { accountDeletion } from "../functions/account-deletion/resource.ts";',
    );
    expect(extensionSchema).toMatch(
      /deleteMyAccount:\s*a\s*\.mutation\(\)\s*\.returns\(a\.boolean\(\)\)\s*\.authorization\(\(allow\) => \[allow\.authenticated\(\)\]\)\s*\.handler\(a\.handler\.function\(accountDeletion\)\)/s,
    );
    expect(extensionSchema).not.toMatch(/deleteMyAccount:[\s\S]*?\.arguments\(/);
  });

  it("rejects a client supplied subject before touching persistence", async () => {
    configureEnvironment();
    const calls: unknown[] = [];
    const handler = createAccountDeletionHandler(async (descriptor) => {
      calls.push(descriptor);
      return {};
    });

    await expect(handler(event({ userId: "user-b" }))).rejects.toThrow(
      "does not accept client-authoritative subject arguments",
    );
    expect(calls).toEqual([]);
  });

  it("rejects missing tenant membership before touching persistence", async () => {
    configureEnvironment();
    const calls: unknown[] = [];
    const handler = createAccountDeletionHandler(async (descriptor) => {
      calls.push(descriptor);
      return {};
    });

    await expect(
      handler({
        arguments: {},
        identity: { sub: "user-a", groups: [], claims: { sub: "user-a" } },
      }),
    ).rejects.toThrow("Tenant membership is required");
    expect(calls).toEqual([]);
  });

  it("deletes only rows that match the authenticated tenant and subject", async () => {
    configureEnvironment();
    const deletedIds: string[] = [];
    const handler = createAccountDeletionHandler(async (descriptor) => {
      if (descriptor.service === "dynamodb" && descriptor.type === "scan") {
        return {
          Items: [
            {
              id: { S: "owned" },
              tenantId: { S: "tenant-a" },
              userId: { S: "user-a" },
            },
          ],
        };
      }
      if (descriptor.service === "dynamodb" && descriptor.type === "query") return { Items: [] };
      if (descriptor.service === "dynamodb" && descriptor.type === "delete") {
        const id = descriptor.input.Key.id?.S;
        if (id) deletedIds.push(id);
        return {};
      }
      if (descriptor.service === "cognito" && descriptor.type === "listUsers") {
        expect(descriptor.input.Filter).toBe('sub = "user-a"');
        return { Users: [{ Username: "cognito-user-a" }] };
      }
      if (descriptor.service === "cognito" && descriptor.type === "adminDeleteUser") return {};
      throw new Error("unexpected command");
    });

    const result = await handler(event());
    expect(result).toBe(true);
    expect(deletedIds).toHaveLength(ENVIRONMENTS.length - 3);
    expect(deletedIds.every((id) => id === "owned")).toBe(true);
  });

  it("fails closed if a scan returns a foreign row", async () => {
    configureEnvironment();
    let cognitoTouched = false;
    const handler = createAccountDeletionHandler(async (descriptor) => {
      if (descriptor.service === "dynamodb" && descriptor.type === "scan") {
        return {
          Items: [
            {
              id: { S: "foreign" },
              tenantId: { S: "tenant-a" },
              userId: { S: "user-b" },
            },
          ],
        };
      }
      if (descriptor.service === "cognito") cognitoTouched = true;
      return { Items: [] };
    });

    await expect(handler(event())).rejects.toThrow("escaped authenticated subject scope");
    expect(cognitoTouched).toBe(false);
  });
});
