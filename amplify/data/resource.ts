import { a, defineData, type ClientSchema } from "@aws-amplify/backend";

export const schema = a.schema({
  TrainingMode: a.enum(["explore", "guided", "challenge"]),
  SelfAssessedAiLevel: a.enum(["beginner", "intermediate", "advanced"]),
  StepStatus: a.enum(["NOT_STARTED", "ACTIVE", "VALIDATION_FAILED", "COMPLETED", "SKIPPED"]),
  AttemptOutcome: a.enum(["PASS", "FAIL", "NEAR_MISS"]),
  ScenarioRunEvidenceStatus: a.enum(["eligible", "suspect_fast", "unassessed"]),
  SkillLevel: a.enum(["novice", "advanced_beginner", "practitioner", "proficient"]),
  AttestationValidityStatus: a.enum(["valid", "expired"]),
  AttestationSigningStatus: a.enum(["signed", "external_signature_required"]),
  AttestationExportFormat: a.enum(["PDF", "CSV"]),
  TelemetryPseudonymizationMode: a.enum(["SESSION", "ANONYMOUS"]),

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

  ScenarioRun: a
    .model({
      ownerKey: a.string().required(),
      tenantId: a.string().required(),
      userId: a.string().required(),
      scenarioId: a.string().required(),
      scenarioVersion: a.string().required(),
      sessionId: a.string().required(),
      mode: a.ref("TrainingMode").required(),
      startedAt: a.float().required(),
      finishedAt: a.float().required(),
      durationMs: a.float().required(),
      estimatedMinutes: a.float(),
      fastRunThresholdRatio: a.float(),
      fastRunThresholdMs: a.float(),
      evidenceStatus: a.ref("ScenarioRunEvidenceStatus").required(),
      evidenceEligible: a.boolean().required(),
      sourceRevision: a.integer().required(),
      appendToken: a.string().required(),
    })
    .secondaryIndexes((index) => [
      index("ownerKey").sortKeys(["finishedAt"]).name("scenarioRunsByOwnerTime"),
    ])
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
      points: a.float().required(),
      level: a.ref("SkillLevel").required(),
      eligibleChallengeCount: a.integer().required(),
      sourceRevision: a.integer().required(),
      calculatedAt: a.float().required(),
    })
    .authorization((allow) => [allow.authenticated()])
    .disableOperations(["queries", "mutations", "subscriptions"]),

  Attestation: a
    .model({
      ownerKey: a.string().required(),
      tenantId: a.string().required(),
      userId: a.string().required(),
      scenarioId: a.string().required(),
      scenarioVersion: a.string().required(),
      productId: a.string().required(),
      productVersion: a.string().required(),
      learningObjectiveIds: a.string().array().required(),
      learningObjectiveId: a.string(),
      issuedAt: a.float().required(),
      validUntil: a.float().required(),
      sourceRevision: a.integer().required(),
      scenarioRunId: a.string().required(),
      sessionId: a.string().required(),
      evidence: a.json().required(),
      provenance: a.json().required(),
      signingStatus: a.ref("AttestationSigningStatus").required(),
      signingAlgorithm: a.string(),
      signingKeyId: a.string(),
      signature: a.string(),
      appendToken: a.string().required(),
    })
    .secondaryIndexes((index) => [
      index("ownerKey").sortKeys(["issuedAt"]).name("attestationsByOwnerTime"),
    ])
    .authorization((allow) => [allow.authenticated()])
    .disableOperations(["queries", "mutations", "subscriptions"]),

  TenantTelemetryPolicy: a
    .model({
      tenantId: a.string().required(),
      pseudonymizationMode: a.ref("TelemetryPseudonymizationMode").required(),
      rawEventRetentionDays: a.integer(),
      updatedAt: a.float().required(),
    })
    .authorization((allow) => [allow.authenticated()])
    .disableOperations(["queries", "mutations", "subscriptions"]),

  TrainingTelemetryEvent: a
    .model({
      tenantId: a.string().required(),
      tenantScenarioKey: a.string().required(),
      subjectKey: a.string().required(),
      eventId: a.string().required(),
      source: a.string().required(),
      eventType: a.string().required(),
      occurredAt: a.float().required(),
      receivedAtEpochSeconds: a.float().required(),
      expiresAtEpochSeconds: a.float().required(),
      sessionId: a.string().required(),
      scenarioId: a.string().required(),
      mode: a.ref("TrainingMode").required(),
      stepId: a.string(),
      payload: a.json().required(),
    })
    .secondaryIndexes((index) => [
      index("tenantScenarioKey").sortKeys(["occurredAt"]).name("telemetryByTenantScenarioTime"),
    ])
    .authorization((allow) => [allow.authenticated()])
    .disableOperations(["queries", "mutations", "subscriptions"]),

  TrainingTelemetryDeletionPointer: a
    .model({
      tenantId: a.string().required(),
      ownerKey: a.string().required(),
      rawEventId: a.string().required(),
      occurredAt: a.float().required(),
      expiresAtEpochSeconds: a.float().required(),
    })
    .secondaryIndexes((index) => [
      index("ownerKey").sortKeys(["occurredAt"]).name("telemetryDeletionByOwnerTime"),
    ])
    .authorization((allow) => [allow.authenticated()])
    .disableOperations(["queries", "mutations", "subscriptions"]),

  TrainingTelemetryAggregate: a
    .model({
      tenantId: a.string().required(),
      tenantScenarioKey: a.string().required(),
      scenarioId: a.string().required(),
      bucketStart: a.float().required(),
      dimensionKey: a.string().required(),
      stepId: a.string(),
      failurePattern: a.string(),
      sessionsStarted: a.integer(),
      sessionsCompleted: a.integer(),
      scenarioDurationTotalMs: a.float(),
      scenarioDurationCount: a.integer(),
      stepStartedCount: a.integer(),
      stepCompletedCount: a.integer(),
      stepDurationTotalMs: a.float(),
      stepDurationCount: a.integer(),
      hintUsageCount: a.integer(),
      failedAttemptCount: a.integer(),
      projectionUpdatedAt: a.float().required(),
    })
    .secondaryIndexes((index) => [
      index("tenantScenarioKey")
        .sortKeys(["bucketStart"])
        .name("telemetryAggregatesByScenarioTime"),
    ])
    .authorization((allow) => [allow.authenticated()])
    .disableOperations(["queries", "mutations", "subscriptions"]),

  TrainingTelemetryProjectionReceipt: a
    .model({
      expiresAtEpochSeconds: a.float().required(),
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

  TenantReportingContext: a.customType({
    tenantId: a.string().required(),
    role: a.string().required(),
    personSpecificAttemptAccess: a.boolean().required(),
  }),

  TenantTelemetryPolicyEnvelope: a.customType({
    pseudonymizationMode: a.ref("TelemetryPseudonymizationMode").required(),
    rawEventRetentionDays: a.integer().required(),
  }),

  TelemetryDeletionPage: a.customType({
    deletedCount: a.integer().required(),
    complete: a.boolean().required(),
  }),

  ScenarioLearningAnalytics: a.customType({
    scenarioId: a.string().required(),
    sessionsStarted: a.integer().required(),
    sessionsCompleted: a.integer().required(),
    abandonmentCount: a.integer().required(),
    averageDurationMs: a.float(),
    cohortSuppressed: a.boolean().required(),
    truncated: a.boolean().required(),
    steps: a.json().required(),
  }),

  ScenarioRunEnvelope: a.customType({
    id: a.id().required(),
    tenantId: a.string().required(),
    userId: a.string().required(),
    scenarioId: a.string().required(),
    scenarioVersion: a.string().required(),
    sessionId: a.string().required(),
    mode: a.ref("TrainingMode").required(),
    startedAt: a.float().required(),
    finishedAt: a.float().required(),
    durationMs: a.float().required(),
    estimatedMinutes: a.float(),
    fastRunThresholdRatio: a.float(),
    fastRunThresholdMs: a.float(),
    evidenceStatus: a.ref("ScenarioRunEvidenceStatus").required(),
    evidenceEligible: a.boolean().required(),
    sourceRevision: a.integer().required(),
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

  SkillProfileEnvelope: a.customType({
    tenantId: a.string().required(),
    userId: a.string().required(),
    technologyId: a.string().required(),
    points: a.float().required(),
    level: a.ref("SkillLevel").required(),
    eligibleChallengeCount: a.integer().required(),
    sourceRevision: a.integer().required(),
    calculatedAt: a.float().required(),
  }),

  AttestationEnvelope: a.customType({
    id: a.id().required(),
    tenantId: a.string().required(),
    userId: a.string().required(),
    scenarioId: a.string().required(),
    scenarioVersion: a.string().required(),
    productId: a.string().required(),
    productVersion: a.string().required(),
    learningObjectiveIds: a.string().array().required(),
    issuedAt: a.float().required(),
    validUntil: a.float().required(),
    sourceRevision: a.integer().required(),
    scenarioRunId: a.string().required(),
    sessionId: a.string().required(),
    evidence: a.json().required(),
    provenance: a.json().required(),
    signingStatus: a.ref("AttestationSigningStatus").required(),
    signingAlgorithm: a.string(),
    signingKeyId: a.string(),
    signature: a.string(),
    validityStatus: a.ref("AttestationValidityStatus").required(),
    recertificationRecommended: a.boolean().required(),
  }),

  AttestationIssueEnvelope: a.customType({
    created: a.boolean().required(),
    reason: a.string().required(),
    attestation: a.ref("AttestationEnvelope"),
  }),

  AttestationExportEnvelope: a.customType({
    attestationId: a.id().required(),
    format: a.ref("AttestationExportFormat").required(),
    filename: a.string().required(),
    mimeType: a.string().required(),
    contentBase64: a.string().required(),
    signingStatus: a.ref("AttestationSigningStatus").required(),
    signingAlgorithm: a.string(),
    signingKeyId: a.string(),
    signature: a.string(),
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

  loadTenantReportingContext: a
    .query()
    .returns(a.ref("TenantReportingContext"))
    .authorization((allow) => [allow.groups(["role:trainer", "role:tenant_admin"])])
    .handler(
      a.handler.custom({
        entry: "./load-tenant-reporting-context.js",
      }),
    ),

  appendTrainingTelemetryEvent: a
    .mutation()
    .arguments({ event: a.json().required() })
    .returns(a.boolean())
    .authorization((allow) => [allow.authenticated()])
    .handler([
      a.handler.custom({
        dataSource: a.ref("TenantTelemetryPolicy"),
        entry: "./telemetry-load-policy-for-write.js",
      }),
      a.handler.custom({
        dataSource: a.ref("TrainingTelemetryEvent"),
        entry: "./append-training-telemetry-event.js",
      }),
      a.handler.custom({
        dataSource: a.ref("TrainingTelemetryDeletionPointer"),
        entry: "./write-telemetry-deletion-pointer.js",
      }),
    ]),

  loadTenantTelemetryPolicy: a
    .query()
    .returns(a.ref("TenantTelemetryPolicyEnvelope"))
    .authorization((allow) => [allow.groups(["role:trainer", "role:tenant_admin"])])
    .handler(
      a.handler.custom({
        dataSource: a.ref("TenantTelemetryPolicy"),
        entry: "./telemetry-load-policy-for-write.js",
      }),
    ),

  saveTenantTelemetryPolicy: a
    .mutation()
    .arguments({
      pseudonymizationMode: a.ref("TelemetryPseudonymizationMode"),
      rawEventRetentionDays: a.integer(),
    })
    .returns(a.ref("TenantTelemetryPolicyEnvelope"))
    .authorization((allow) => [allow.groups(["role:tenant_admin"])])
    .handler([
      a.handler.custom({
        dataSource: a.ref("TenantTelemetryPolicy"),
        entry: "./telemetry-load-policy-for-write.js",
      }),
      a.handler.custom({
        dataSource: a.ref("TenantTelemetryPolicy"),
        entry: "./save-tenant-telemetry-policy.js",
      }),
    ]),

  deleteMyPersonalTelemetry: a
    .mutation()
    .returns(a.ref("TelemetryDeletionPage"))
    .authorization((allow) => [allow.authenticated()])
    .handler([
      a.handler.custom({
        dataSource: a.ref("TrainingTelemetryDeletionPointer"),
        entry: "./delete-my-telemetry-page.js",
      }),
      a.handler.custom({
        dataSource: a.ref("TrainingTelemetryEvent"),
        entry: "./delete-my-telemetry-item-0.js",
      }),
      a.handler.custom({
        dataSource: a.ref("TrainingTelemetryDeletionPointer"),
        entry: "./delete-my-telemetry-item-1.js",
      }),
      a.handler.custom({
        dataSource: a.ref("TrainingTelemetryEvent"),
        entry: "./delete-my-telemetry-item-2.js",
      }),
      a.handler.custom({
        dataSource: a.ref("TrainingTelemetryDeletionPointer"),
        entry: "./delete-my-telemetry-item-3.js",
      }),
      a.handler.custom({
        dataSource: a.ref("TrainingTelemetryEvent"),
        entry: "./delete-my-telemetry-item-4.js",
      }),
      a.handler.custom({
        dataSource: a.ref("TrainingTelemetryDeletionPointer"),
        entry: "./delete-my-telemetry-item-5.js",
      }),
      a.handler.custom({
        dataSource: a.ref("TrainingTelemetryEvent"),
        entry: "./delete-my-telemetry-item-6.js",
      }),
      a.handler.custom({
        dataSource: a.ref("TrainingTelemetryDeletionPointer"),
        entry: "./delete-my-telemetry-item-7.js",
      }),
    ]),

  loadTrainingAnalytics: a
    .query()
    .arguments({
      scenarioId: a.string().required(),
      from: a.float(),
      to: a.float(),
    })
    .returns(a.ref("ScenarioLearningAnalytics"))
    .authorization((allow) => [allow.groups(["role:trainer", "role:tenant_admin"])])
    .handler(
      a.handler.custom({
        dataSource: a.ref("TrainingTelemetryEvent"),
        entry: "./load-training-analytics.js",
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
        dataSource: a.ref("ScenarioRun"),
        entry: "./award-score-write-run.generated.js",
      }),
      a.handler.custom({
        dataSource: a.ref("ScoreEvent"),
        entry: "./award-score-write-event.generated.js",
      }),
    ]),

  issueChallengeAttestation: a
    .mutation()
    .arguments({ scenarioId: a.string().required() })
    .returns(a.ref("AttestationIssueEnvelope"))
    .authorization((allow) => [allow.authenticated()])
    .handler([
      a.handler.custom({
        dataSource: a.ref("TrainingSession"),
        entry: "./issue-attestation-load-session.generated.js",
      }),
      a.handler.custom({
        dataSource: a.ref("ScenarioRun"),
        entry: "./issue-attestation-load-run.js",
      }),
      a.handler.custom({
        dataSource: a.ref("Attestation"),
        entry: "./issue-attestation-write.js",
      }),
    ]),

  listMyAttestations: a
    .query()
    .arguments({ limit: a.integer() })
    .returns(a.ref("AttestationEnvelope").array())
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.custom({
        dataSource: a.ref("Attestation"),
        entry: "./list-attestations.js",
      }),
    ),

  exportMyAttestation: a
    .query()
    .arguments({
      attestationId: a.id().required(),
      format: a.ref("AttestationExportFormat").required(),
    })
    .returns(a.ref("AttestationExportEnvelope"))
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.custom({
        dataSource: a.ref("Attestation"),
        entry: "./export-attestation.js",
      }),
    ),

  listMySkillProfiles: a
    .query()
    .returns(a.ref("SkillProfileEnvelope").array())
    .authorization((allow) => [allow.authenticated()])
    .handler([
      a.handler.custom({
        dataSource: a.ref("ScoreEvent"),
        entry: "./skill-profile-load-score-events.js",
      }),
      a.handler.custom({
        dataSource: a.ref("ScenarioRun"),
        entry: "./skill-profile-load-runs.js",
      }),
      a.handler.custom({
        entry: "./skill-profile-calculate.js",
      }),
    ]),

  listMyScenarioRuns: a
    .query()
    .arguments({ limit: a.integer() })
    .returns(a.ref("ScenarioRunEnvelope").array())
    .authorization((allow) => [allow.authenticated()])
    .handler(
      a.handler.custom({
        dataSource: a.ref("ScenarioRun"),
        entry: "./list-scenario-runs.js",
      }),
    ),

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
