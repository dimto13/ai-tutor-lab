import { a, defineData, type ClientSchema } from "@aws-amplify/backend";

export const schema = a.schema({
  TrainingMode: a.enum(["explore", "guided", "challenge"]),
  SelfAssessedAiLevel: a.enum(["beginner", "intermediate", "advanced"]),
  StepStatus: a.enum(["NOT_STARTED", "ACTIVE", "VALIDATION_FAILED", "COMPLETED", "SKIPPED"]),
  AttemptOutcome: a.enum(["PASS", "FAIL", "NEAR_MISS"]),

  UserProfile: a
    .model({
      tenantId: a.string().required(),
      userId: a.string().required(),
      displayName: a.string(),
      email: a.email(),
      profileVersion: a.integer().required(),
    })
    .authorization((allow) => [allow.authenticated()])
    .disableOperations(["queries", "mutations", "subscriptions"]),

  UserPreferences: a
    .model({
      tenantId: a.string().required(),
      userId: a.string().required(),
      language: a.string(),
      preferredTrainingMode: a.ref("TrainingMode"),
      weeklyGoalMinutes: a.integer(),
      accessibility: a.json(),
      selfAssessedAiLevel: a.ref("SelfAssessedAiLevel"),
      preferencesVersion: a.integer().required(),
      stateUpdatedAt: a.float().required(),
    })
    .authorization((allow) => [allow.authenticated()])
    .disableOperations(["queries", "mutations", "subscriptions"]),

  TrainingSession: a
    .model({
      tenantId: a.string().required(),
      userId: a.string().required(),
      scenarioId: a.string().required(),
      mode: a.ref("TrainingMode").required(),
      schemaVersion: a.integer().required(),
      revision: a.integer().required(),
      stateUpdatedAt: a.float().required(),
      payload: a.json().required(),
    })
    .authorization((allow) => [allow.authenticated()])
    .disableOperations(["queries", "mutations", "subscriptions"]),

  StepState: a
    .model({
      tenantId: a.string().required(),
      userId: a.string().required(),
      scenarioId: a.string().required(),
      mode: a.ref("TrainingMode").required(),
      stepId: a.string().required(),
      status: a.ref("StepStatus").required(),
      stateUpdatedAt: a.float().required(),
    })
    .authorization((allow) => [allow.authenticated()])
    .disableOperations(["queries", "mutations", "subscriptions"]),

  RuntimeSnapshot: a
    .model({
      tenantId: a.string().required(),
      userId: a.string().required(),
      scenarioId: a.string().required(),
      mode: a.ref("TrainingMode").required(),
      runtimeId: a.string().required(),
      schemaVersion: a.integer().required(),
      revision: a.integer().required(),
      stateUpdatedAt: a.float().required(),
      payload: a.json().required(),
    })
    .authorization((allow) => [allow.authenticated()])
    .disableOperations(["queries", "mutations", "subscriptions"]),

  HintUsage: a
    .model({
      tenantId: a.string().required(),
      userId: a.string().required(),
      scenarioId: a.string().required(),
      mode: a.ref("TrainingMode").required(),
      stepId: a.string().required(),
      level: a.integer().required(),
      occurredAt: a.float().required(),
    })
    .authorization((allow) => [allow.authenticated()])
    .disableOperations(["queries", "mutations", "subscriptions"]),

  Attempt: a
    .model({
      tenantId: a.string().required(),
      userId: a.string().required(),
      scenarioId: a.string().required(),
      mode: a.ref("TrainingMode").required(),
      stepId: a.string().required(),
      outcome: a.ref("AttemptOutcome").required(),
      occurredAt: a.float().required(),
      message: a.string(),
    })
    .authorization((allow) => [allow.authenticated()])
    .disableOperations(["queries", "mutations", "subscriptions"]),

  ScoreEvent: a
    .model({
      ownerKey: a.string().required(),
      tenantId: a.string().required(),
      userId: a.string().required(),
      scenarioId: a.string().required(),
      scenarioVersion: a.string().required(),
      sessionId: a.string().required(),
      mode: a.ref("TrainingMode").required(),
      eventType: a.string().required(),
      pointsDelta: a.float().required(),
      occurredAt: a.float().required(),
      sourceRevision: a.integer().required(),
      metadata: a.json().required(),
      appendToken: a.string().required(),
    })
    .secondaryIndexes((index) => [
      index("ownerKey").sortKeys(["occurredAt"]).name("scoreEventsByOwnerTime"),
    ])
    .authorization((allow) => [allow.authenticated()])
    .disableOperations(["queries", "mutations", "subscriptions"]),

  SkillProfile: a
    .model({
      tenantId: a.string().required(),
      userId: a.string().required(),
      technologyId: a.string().required(),
      points: a.integer().required(),
      level: a.string(),
      sourceRevision: a.integer().required(),
      calculatedAt: a.float().required(),
    })
    .authorization((allow) => [allow.authenticated()])
    .disableOperations(["queries", "mutations", "subscriptions"]),

  Attestation: a
    .model({
      tenantId: a.string().required(),
      userId: a.string().required(),
      learningObjectiveId: a.string().required(),
      issuedAt: a.float().required(),
      validUntil: a.float(),
      sourceRevision: a.integer().required(),
      evidence: a.json(),
    })
    .authorization((allow) => [allow.authenticated()])
    .disableOperations(["queries", "mutations", "subscriptions"]),

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

  UserProfileEnvelope: a.customType({
    tenantId: a.string().required(),
    userId: a.string().required(),
    displayName: a.string(),
    email: a.email(),
    revision: a.integer().required(),
  }),

  UserPreferencesEnvelope: a.customType({
    tenantId: a.string().required(),
    userId: a.string().required(),
    language: a.string(),
    preferredTrainingMode: a.ref("TrainingMode"),
    weeklyGoalMinutes: a.integer(),
    accessibility: a.json(),
    selfAssessedAiLevel: a.ref("SelfAssessedAiLevel"),
    revision: a.integer().required(),
    updatedAt: a.float().required(),
  }),

  ScoreEventEnvelope: a.customType({
    id: a.id().required(),
    tenantId: a.string().required(),
    userId: a.string().required(),
    scenarioId: a.string().required(),
    scenarioVersion: a.string().required(),
    sessionId: a.string().required(),
    mode: a.ref("TrainingMode").required(),
    eventType: a.string().required(),
    points: a.float().required(),
    occurredAt: a.float().required(),
    sourceRevision: a.integer().required(),
    breakdown: a.json().required(),
  }),

  ScoreAwardEnvelope: a.customType({
    created: a.boolean().required(),
    event: a.ref("ScoreEventEnvelope").required(),
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
      expectedRevision: a.integer(),
    })
    .returns(a.boolean())
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.custom({
        dataSource: a.ref("RuntimeSnapshot"),
        entry: "./delete-runtime-snapshot.js",
      }),
    ),

  loadUserProfile: a
    .query()
    .returns(a.ref("UserProfileEnvelope"))
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.custom({
        dataSource: a.ref("UserProfile"),
        entry: "./load-user-profile.js",
      }),
    ),

  saveUserProfile: a
    .mutation()
    .arguments({
      displayName: a.string(),
      expectedRevision: a.integer(),
    })
    .returns(a.ref("UserProfileEnvelope"))
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.custom({
        dataSource: a.ref("UserProfile"),
        entry: "./save-user-profile.js",
      }),
    ),

  loadUserPreferences: a
    .query()
    .returns(a.ref("UserPreferencesEnvelope"))
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.custom({
        dataSource: a.ref("UserPreferences"),
        entry: "./load-user-preferences.js",
      }),
    ),

  saveUserPreferences: a
    .mutation()
    .arguments({
      language: a.string(),
      preferredTrainingMode: a.ref("TrainingMode"),
      weeklyGoalMinutes: a.integer(),
      accessibility: a.json(),
      selfAssessedAiLevel: a.ref("SelfAssessedAiLevel"),
      expectedRevision: a.integer(),
    })
    .returns(a.ref("UserPreferencesEnvelope"))
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.custom({
        dataSource: a.ref("UserPreferences"),
        entry: "./save-user-preferences.js",
      }),
    ),

  awardScenarioScore: a
    .mutation()
    .arguments({
      scenarioId: a.string().required(),
      mode: a.ref("TrainingMode").required(),
    })
    .returns(a.ref("ScoreAwardEnvelope"))
    .authorization((allow) => [allow.authenticated()])
    .handler([
      a.handler.custom({
        dataSource: a.ref("TrainingSession"),
        entry: "./award-score-load-session.js",
      }),
      a.handler.custom({
        dataSource: a.ref("ScoreEvent"),
        entry: "./award-score-write-event.js",
      }),
    ]),

  listMyScoreEvents: a
    .query()
    .arguments({ limit: a.integer() })
    .returns(a.ref("ScoreEventEnvelope").array())
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.custom({
        dataSource: a.ref("ScoreEvent"),
        entry: "./list-score-events.js",
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
