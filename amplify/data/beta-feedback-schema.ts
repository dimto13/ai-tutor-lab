import { a } from "@aws-amplify/backend";

/**
 * Beta feedback persistence is intentionally exposed only through the custom
 * operations below. Raw model CRUD stays disabled so tenant/user authority is
 * always derived by the server-side resolvers rather than client fields.
 */
export const betaFeedbackSchema = {
  BetaFeedback: a
    .model({
      clientId: a.string().required(),
      tenantId: a.string().required(),
      userId: a.string().required(),
      ownerKey: a.string().required(),
      source: a.string().required(),
      kind: a.string().required(),
      text: a.string().required(),
      scenarioId: a.string().required(),
      stepId: a.string(),
      mode: a.string().required(),
      runtimeAdapterId: a.string(),
      appVersion: a.string().required(),
      commit: a.string().required(),
      clientTimestamp: a.string().required(),
      receivedAt: a.float().required(),
      expiresAtEpochSeconds: a.float().required(),
    })
    .secondaryIndexes((index) => [
      index("tenantId").sortKeys(["receivedAt"]).name("betaFeedbackByTenantTime"),
    ])
    .authorization((allow) => [allow.authenticated()])
    .disableOperations(["queries", "mutations", "subscriptions"]),

  BetaFeedbackAdmission: a
    .model({
      tenantId: a.string().required(),
      userId: a.string().required(),
      recordType: a.string().required(),
      attemptCount: a.integer().required(),
      expiresAtEpochSeconds: a.float().required(),
    })
    .authorization((allow) => [allow.authenticated()])
    .disableOperations(["queries", "mutations", "subscriptions"]),

  BetaFeedbackIngestResult: a.customType({
    accepted: a.boolean().required(),
    duplicate: a.boolean().required(),
  }),

  BetaFeedbackEnvelope: a.customType({
    id: a.id().required(),
    clientId: a.string().required(),
    tenantId: a.string().required(),
    userId: a.string().required(),
    source: a.string().required(),
    kind: a.string().required(),
    text: a.string().required(),
    scenarioId: a.string().required(),
    stepId: a.string(),
    mode: a.string().required(),
    runtimeAdapterId: a.string(),
    appVersion: a.string().required(),
    commit: a.string().required(),
    clientTimestamp: a.string().required(),
    receivedAt: a.float().required(),
  }),

  submitBetaFeedback: a
    .mutation()
    .arguments({ input: a.json().required() })
    .returns(a.ref("BetaFeedbackIngestResult"))
    .authorization((allow) => [allow.authenticated()])
    .handler([
      a.handler.custom({
        dataSource: a.ref("TenantTelemetryPolicy"),
        entry: "./telemetry-load-policy-for-write.js",
      }),
      a.handler.custom({
        dataSource: a.ref("BetaFeedbackAdmission"),
        entry: "./admit-beta-feedback.js",
      }),
      a.handler.custom({
        dataSource: a.ref("BetaFeedback"),
        entry: "./save-beta-feedback.js",
      }),
    ]),

  listBetaFeedback: a
    .query()
    .arguments({ limit: a.integer() })
    .returns(a.ref("BetaFeedbackEnvelope").array())
    .authorization((allow) => [allow.groups(["role:owner", "role:tenant_admin"])])
    .handler(
      a.handler.custom({
        dataSource: a.ref("BetaFeedback"),
        entry: "./list-beta-feedback.js",
      }),
    ),

  exportBetaFeedbackCsv: a
    .query()
    .arguments({ limit: a.integer() })
    .returns(a.string())
    .authorization((allow) => [allow.groups(["role:owner", "role:tenant_admin"])])
    .handler([
      a.handler.custom({
        dataSource: a.ref("BetaFeedback"),
        entry: "./list-beta-feedback.js",
      }),
      a.handler.custom({
        entry: "./export-beta-feedback-csv.js",
      }),
    ]),
} as const;
