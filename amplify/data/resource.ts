import { a, defineData, type ClientSchema } from "@aws-amplify/backend";

const schema = a.schema({
  TrainingMode: a.enum(["explore", "guided", "challenge"]),
  StepStatus: a.enum([
    "NOT_STARTED",
    "ACTIVE",
    "VALIDATION_FAILED",
    "COMPLETED",
    "SKIPPED",
  ]),
  AttemptOutcome: a.enum(["PASS", "FAIL", "NEAR_MISS"]),

  UserProfile: a.model({
    tenantId: a.string().required(),
    userId: a.string().required(),
    displayName: a.string(),
    email: a.email(),
    profileVersion: a.integer().required(),
  }),

  UserPreferences: a.model({
    tenantId: a.string().required(),
    userId: a.string().required(),
    language: a.string(),
    preferredTrainingMode: a.ref("TrainingMode"),
    weeklyGoalMinutes: a.integer(),
    accessibility: a.json(),
    preferencesVersion: a.integer().required(),
  }),

  TrainingSession: a.model({
    tenantId: a.string().required(),
    userId: a.string().required(),
    scenarioId: a.string().required(),
    mode: a.ref("TrainingMode").required(),
    schemaVersion: a.integer().required(),
    revision: a.integer().required(),
    stateUpdatedAt: a.float().required(),
    payload: a.json().required(),
  }),

  StepState: a.model({
    tenantId: a.string().required(),
    userId: a.string().required(),
    scenarioId: a.string().required(),
    mode: a.ref("TrainingMode").required(),
    stepId: a.string().required(),
    status: a.ref("StepStatus").required(),
    stateUpdatedAt: a.float().required(),
  }),

  RuntimeSnapshot: a.model({
    tenantId: a.string().required(),
    userId: a.string().required(),
    scenarioId: a.string().required(),
    mode: a.ref("TrainingMode").required(),
    runtimeId: a.string().required(),
    schemaVersion: a.integer().required(),
    revision: a.integer().required(),
    stateUpdatedAt: a.float().required(),
    payload: a.json().required(),
  }),

  HintUsage: a.model({
    tenantId: a.string().required(),
    userId: a.string().required(),
    scenarioId: a.string().required(),
    mode: a.ref("TrainingMode").required(),
    stepId: a.string().required(),
    level: a.integer().required(),
    occurredAt: a.float().required(),
  }),

  Attempt: a.model({
    tenantId: a.string().required(),
    userId: a.string().required(),
    scenarioId: a.string().required(),
    mode: a.ref("TrainingMode").required(),
    stepId: a.string().required(),
    outcome: a.ref("AttemptOutcome").required(),
    occurredAt: a.float().required(),
    message: a.string(),
  }),

  ScoreEvent: a.model({
    tenantId: a.string().required(),
    userId: a.string().required(),
    scenarioId: a.string().required(),
    mode: a.ref("TrainingMode").required(),
    eventType: a.string().required(),
    pointsDelta: a.integer().required(),
    occurredAt: a.float().required(),
    sourceRevision: a.integer(),
    metadata: a.json(),
  }),

  SkillProfile: a.model({
    tenantId: a.string().required(),
    userId: a.string().required(),
    technologyId: a.string().required(),
    points: a.integer().required(),
    level: a.string(),
    sourceRevision: a.integer().required(),
    calculatedAt: a.float().required(),
  }),

  Attestation: a.model({
    tenantId: a.string().required(),
    userId: a.string().required(),
    learningObjectiveId: a.string().required(),
    issuedAt: a.float().required(),
    validUntil: a.float(),
    sourceRevision: a.integer().required(),
    evidence: a.json(),
  }),

  TrainingStateEnvelope: a.customType({
    tenantId: a.string().required(),
    userId: a.string().required(),
    scenarioId: a.string().required(),
    mode: a.ref("TrainingMode").required(),
    schemaVersion: a.integer().required(),
    revision: a.integer().required(),
    updatedAt: a.float().required(),
    payload: a.json().required(),
  }),

  RuntimeSnapshotEnvelope: a.customType({
    tenantId: a.string().required(),
    userId: a.string().required(),
    scenarioId: a.string().required(),
    mode: a.ref("TrainingMode").required(),
    runtimeId: a.string().required(),
    schemaVersion: a.integer().required(),
    revision: a.integer().required(),
    updatedAt: a.float().required(),
    payload: a.json().required(),
  }),

  loadTrainingState: a
    .query()
    .arguments({
      scenarioId: a.string().required(),
      mode: a.ref("TrainingMode").required(),
    })
    .returns(a.ref("TrainingStateEnvelope"))
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.custom({
        dataSource: a.ref("TrainingSession"),
        entry: "./load-training-state.js",
      }),
    ),

  saveTrainingState: a
    .mutation()
    .arguments({
      scenarioId: a.string().required(),
      mode: a.ref("TrainingMode").required(),
      schemaVersion: a.integer().required(),
      expectedRevision: a.integer(),
      payload: a.json().required(),
    })
    .returns(a.ref("TrainingStateEnvelope"))
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.custom({
        dataSource: a.ref("TrainingSession"),
        entry: "./save-training-state.js",
      }),
    ),

  loadRuntimeSnapshot: a
    .query()
    .arguments({
      scenarioId: a.string().required(),
      mode: a.ref("TrainingMode").required(),
      runtimeId: a.string().required(),
    })
    .returns(a.ref("RuntimeSnapshotEnvelope"))
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.custom({
        dataSource: a.ref("RuntimeSnapshot"),
        entry: "./load-runtime-snapshot.js",
      }),
    ),

  saveRuntimeSnapshot: a
    .mutation()
    .arguments({
      scenarioId: a.string().required(),
      mode: a.ref("TrainingMode").required(),
      runtimeId: a.string().required(),
      schemaVersion: a.integer().required(),
      expectedRevision: a.integer(),
      payload: a.json().required(),
    })
    .returns(a.ref("RuntimeSnapshotEnvelope"))
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.custom({
        dataSource: a.ref("RuntimeSnapshot"),
        entry: "./save-runtime-snapshot.js",
      }),
    ),

  deleteRuntimeSnapshot: a
    .mutation()
    .arguments({
      scenarioId: a.string().required(),
      mode: a.ref("TrainingMode").required(),
      runtimeId: a.string().required(),
    })
    .returns(a.boolean())
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.custom({
        dataSource: a.ref("RuntimeSnapshot"),
        entry: "./delete-runtime-snapshot.js",
      }),
    ),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
