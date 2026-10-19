import assert from "node:assert/strict";
import test from "node:test";
import type { TrainingEvent } from "@ai-train-lab/training-engine";
import { submitBetaFeedbackWithClient } from "../src/adapters/betaFeedbackClient.ts";
import { createAmplifyAttestationServiceWithClient } from "../src/attestations/adapters/amplifyAttestationService.ts";
import { createAmplifyUserPreferencesRepositoryWithClient } from "../src/persistence/adapters/amplifyUserPreferencesRepository.ts";
import {
  createAmplifyTelemetryEventWriterWithClient,
  createAmplifyTrainingAnalyticsServiceWithClient,
} from "../src/telemetry/adapters/amplifyTelemetryAdapter.ts";

// AppSync carries AWSJSON as a JSON string in both directions
// (https://docs.aws.amazon.com/appsync/latest/devguide/scalars.html). These fakes answer the way
// AppSync does, so every adapter has to encode its AWSJSON arguments and decode its AWSJSON fields.

type Captured = Record<string, unknown>;

test("telemetry events reach AppSync as a JSON string", async () => {
  const sent: Captured[] = [];
  type Client = Parameters<typeof createAmplifyTelemetryEventWriterWithClient>[0];
  const writer = createAmplifyTelemetryEventWriterWithClient({
    mutations: {
      appendTrainingTelemetryEvent: async (args: Captured) => {
        sent.push(args);
        return { data: true, errors: undefined };
      },
    },
  } as unknown as Client);
  const event = {
    id: "event-1",
    type: "step.completed",
    occurredAt: 1,
  } as unknown as TrainingEvent;

  await writer.write(event);

  assert.equal(typeof sent[0]?.["event"], "string");
  assert.deepEqual(JSON.parse(sent[0]?.["event"] as string), event);
});

test("training analytics decodes the AWSJSON step metrics", async () => {
  const steps = [
    {
      stepId: "select-html-artifact",
      abandonmentCount: 1,
      hintUsageCount: 2,
      averageDurationMs: 4_000,
      failedAttemptCount: 3,
      failurePatterns: [{ pattern: "wrong-target", count: 3 }],
    },
  ];
  type Client = Parameters<typeof createAmplifyTrainingAnalyticsServiceWithClient>[0];
  const service = createAmplifyTrainingAnalyticsServiceWithClient({
    queries: {
      loadTrainingAnalytics: async () => ({
        data: {
          scenarioId: "artifact-preview-foundation.guided",
          sessionsStarted: 5,
          sessionsCompleted: 4,
          abandonmentCount: 1,
          averageDurationMs: 60_000,
          cohortSuppressed: false,
          truncated: false,
          steps: JSON.stringify(steps),
        },
        errors: undefined,
      }),
    },
  } as unknown as Client);

  const analytics = await service.loadScenarioMetrics({
    scenarioId: "artifact-preview-foundation.guided",
  });

  assert.deepEqual(analytics.steps, steps);
});

test("attestations decode the AWSJSON evidence", async () => {
  const evidence = {
    evidenceStatus: "eligible",
    challengeOutcome: "passed",
    learningObjectiveIds: ["objective-1"],
    scenarioRunId: "run-1",
    sessionId: "session-1",
    sourceRevision: 2,
  };
  type Client = Parameters<typeof createAmplifyAttestationServiceWithClient>[0];
  const service = createAmplifyAttestationServiceWithClient({
    queries: {
      listMyAttestations: async () => ({
        data: [
          {
            id: "attestation:v2|t:y|tenant-a|alice|vscode-shortcuts.challenge",
            userId: "alice",
            tenantId: "tenant-a",
            validityStatus: "valid",
            sourceRevision: 2,
            learningObjectiveIds: ["objective-1"],
            evidence: JSON.stringify(evidence),
            provenance: JSON.stringify({ issuer: "server" }),
            scenarioId: "vscode-shortcuts.challenge",
            scenarioVersion: "1",
            productId: "vscode",
            productVersion: "1",
            issuedAt: 1_700_000_000_000,
            validUntil: 1_800_000_000_000,
            signingStatus: "external_signature_required",
            recertificationRecommended: false,
          },
        ],
        errors: undefined,
      }),
    },
  } as unknown as Client);

  const [attestation] = await service.listAttestations();

  assert.equal(attestation?.evidence.scenarioRunId, "run-1");
  assert.deepEqual(attestation?.evidence.learningObjectiveIds, ["objective-1"]);
});

test("accessibility preferences travel as AWSJSON and null stays null", async () => {
  const sent: Captured[] = [];
  const accessibility = { reducedMotion: true, fontScale: 1.25 };
  const stored = {
    userId: "alice",
    tenantId: "tenant-a",
    language: "de",
    preferredTrainingMode: "guided",
    weeklyGoalMinutes: 30,
    selfAssessedAiLevel: null,
    revision: 1,
    updatedAt: 1_700_000_000_000,
  };
  type Client = Parameters<typeof createAmplifyUserPreferencesRepositoryWithClient>[0];
  const repository = createAmplifyUserPreferencesRepositoryWithClient({
    queries: {
      loadUserPreferences: async () => ({
        data: { ...stored, accessibility: JSON.stringify(accessibility) },
        errors: undefined,
      }),
    },
    mutations: {
      saveUserPreferences: async (args: Captured) => {
        sent.push(args);
        return { data: { ...stored, accessibility: args["accessibility"] }, errors: undefined };
      },
    },
  } as unknown as Client);
  const subject = { userId: "alice", tenantId: "tenant-a" };
  const value = {
    language: "de",
    preferredTrainingMode: "guided" as const,
    weeklyGoalMinutes: 30,
    selfAssessedAiLevel: null,
  };

  const saved = await repository.save(subject, { ...value, accessibility }, null);
  assert.equal(sent[0]?.["accessibility"], JSON.stringify(accessibility));
  assert.deepEqual(saved.accessibility, accessibility);

  const cleared = await repository.save(subject, { ...value, accessibility: null }, 1);
  assert.equal(sent[1]?.["accessibility"], null);
  assert.equal(cleared.accessibility, null);

  await repository.save(subject, { ...value, accessibility: undefined }, 2);
  assert.equal(sent[2]?.["accessibility"], null);

  const loaded = await repository.load(subject);
  assert.deepEqual(loaded?.accessibility, accessibility);
});

test("beta feedback reaches AppSync as a JSON string without screenshot or runtime details", async () => {
  const sent: Captured[] = [];
  type Client = Parameters<typeof submitBetaFeedbackWithClient>[0];
  const client = {
    mutations: {
      submitBetaFeedback: async (args: Captured) => {
        sent.push(args);
        // The resolver only accepts an object after AppSync parsed the AWSJSON string.
        if (typeof args["input"] !== "string") {
          return {
            data: null,
            errors: [
              { message: "Variable 'input' has an invalid value.", errorType: "BadRequest" },
            ],
          };
        }
        return { data: { accepted: true, duplicate: false }, errors: undefined };
      },
    },
  } as unknown as Client;

  const result = await submitBetaFeedbackWithClient(client, {
    id: "7f4aa9e6-21da-4138-9b11-f00d374ed329",
    source: "tutor",
    kind: "problem",
    text: "Das Fenster mit der Übersicht war nach dem Training sofort wieder weg.",
    context: {
      scenarioId: "vscode-basics.guided",
      stepId: "open_output",
      mode: "guided",
      runtimeAdapterId: "vscode-simulator",
      runtime: {
        productId: "vscode",
        capabilities: ["editor"],
        viewportClass: "large",
        stepStatus: "ACTIVE",
        hintsUsed: 0,
        mistakes: 1,
      },
      appVersion: "0.0.0",
      commit: "32c998aa32fabfd470da2cb9dce9d68f46bbebb8",
      timestamp: "2026-10-19T07:15:16.547Z",
    },
    screenshot: {
      kind: "screenshot",
      mediaType: "image/png",
      dataUrl: "data:image/png;base64,AAAA",
      width: 1,
      height: 1,
      capturedArea: "training-surface",
    },
  });

  assert.deepEqual(result, { ok: true, duplicate: false });
  assert.equal(typeof sent[0]?.["input"], "string");
  assert.deepEqual(JSON.parse(sent[0]?.["input"] as string), {
    id: "7f4aa9e6-21da-4138-9b11-f00d374ed329",
    source: "tutor",
    kind: "problem",
    text: "Das Fenster mit der Übersicht war nach dem Training sofort wieder weg.",
    context: {
      scenarioId: "vscode-basics.guided",
      stepId: "open_output",
      mode: "guided",
      runtimeAdapterId: "vscode-simulator",
      appVersion: "0.0.0",
      commit: "32c998aa32fabfd470da2cb9dce9d68f46bbebb8",
      timestamp: "2026-10-19T07:15:16.547Z",
    },
  });
});
