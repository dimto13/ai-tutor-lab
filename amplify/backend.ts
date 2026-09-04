import { defineBackend } from "@aws-amplify/backend";
import { AttributeType, BillingMode, StreamViewType, Table } from "aws-cdk-lib/aws-dynamodb";
import { EventSourceMapping, StartingPosition } from "aws-cdk-lib/aws-lambda";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { runtimeIncidentReporter } from "./functions/runtime-incident-reporter/resource";
import { telemetryAggregateProjector } from "./functions/telemetry-aggregate-projector/resource";
import { telemetryDeletionWorker } from "./functions/telemetry-deletion-worker/resource";
import { userDataExport } from "./functions/user-data-export/resource";

function requiredResource<T>(resource: T | undefined, name: string): T {
  if (resource === undefined) throw new Error(`Missing generated backend resource: ${name}`);
  return resource;
}

export const backend = defineBackend({
  auth,
  data,
  runtimeIncidentReporter,
  telemetryAggregateProjector,
  telemetryDeletionWorker,
  userDataExport,
});

const { cfnIdentityPool } = backend.auth.resources.cfnResources;
cfnIdentityPool.allowUnauthenticatedIdentities = false;

const { amplifyDynamoDbTables } = backend.data.resources.cfnResources;
const rawTelemetryCfnTable = requiredResource(
  amplifyDynamoDbTables["TrainingTelemetryEvent"],
  "TrainingTelemetryEvent CfnTable",
);
const deletionPointerCfnTable = requiredResource(
  amplifyDynamoDbTables["TrainingTelemetryDeletionPointer"],
  "TrainingTelemetryDeletionPointer CfnTable",
);
const projectionReceiptCfnTable = requiredResource(
  amplifyDynamoDbTables["TrainingTelemetryProjectionReceipt"],
  "TrainingTelemetryProjectionReceipt CfnTable",
);
rawTelemetryCfnTable.streamSpecification = {
  streamViewType: StreamViewType.NEW_IMAGE,
};
for (const table of [rawTelemetryCfnTable, deletionPointerCfnTable, projectionReceiptCfnTable]) {
  table.timeToLiveAttribute = {
    attributeName: "expiresAtEpochSeconds",
    enabled: true,
  };
}

const rawTelemetryTable = requiredResource(
  backend.data.resources.tables["TrainingTelemetryEvent"],
  "TrainingTelemetryEvent table",
);
const deletionPointerTable = requiredResource(
  backend.data.resources.tables["TrainingTelemetryDeletionPointer"],
  "TrainingTelemetryDeletionPointer table",
);
const aggregateTable = requiredResource(
  backend.data.resources.tables["TrainingTelemetryAggregate"],
  "TrainingTelemetryAggregate table",
);
const projectionReceiptTable = requiredResource(
  backend.data.resources.tables["TrainingTelemetryProjectionReceipt"],
  "TrainingTelemetryProjectionReceipt table",
);
const rawTelemetryStreamArn = requiredResource(
  rawTelemetryTable.tableStreamArn,
  "TrainingTelemetryEvent stream ARN",
);
const projectorLambda = backend.telemetryAggregateProjector.resources.lambda;
const deletionLambda = backend.telemetryDeletionWorker.resources.lambda;
const userDataExportLambda = backend.userDataExport.resources.lambda;
const incidentLambda = backend.runtimeIncidentReporter.resources.lambda;

const runtimeIncidentTable = new Table(backend.data.stack, "RuntimeIncidentAggregate", {
  partitionKey: { name: "fingerprint", type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
});
runtimeIncidentTable.grantReadWriteData(incidentLambda);
backend.runtimeIncidentReporter.addEnvironment(
  "RUNTIME_INCIDENT_TABLE_NAME",
  runtimeIncidentTable.tableName,
);
// Repository is an explicit allowlist. The token is injected only into this server-side function
// by deployment configuration and must carry issues:write for this repository only.
backend.runtimeIncidentReporter.addEnvironment(
  "RUNTIME_INCIDENT_GITHUB_REPOSITORY",
  "dimto13/ai-tutor-lab",
);

aggregateTable.grantReadWriteData(projectorLambda);
projectionReceiptTable.grantReadWriteData(projectorLambda);
rawTelemetryTable.grantStreamRead(projectorLambda);
backend.telemetryAggregateProjector.addEnvironment(
  "TELEMETRY_AGGREGATE_TABLE_NAME",
  aggregateTable.tableName,
);
backend.telemetryAggregateProjector.addEnvironment(
  "TELEMETRY_PROJECTION_RECEIPT_TABLE_NAME",
  projectionReceiptTable.tableName,
);

rawTelemetryTable.grantReadWriteData(deletionLambda);
deletionPointerTable.grantReadWriteData(deletionLambda);
backend.telemetryDeletionWorker.addEnvironment(
  "TELEMETRY_RAW_EVENT_TABLE_NAME",
  rawTelemetryTable.tableName,
);
backend.telemetryDeletionWorker.addEnvironment(
  "TELEMETRY_DELETION_POINTER_TABLE_NAME",
  deletionPointerTable.tableName,
);

const exportTables = [
  ["USER_PROFILE_TABLE_NAME", "UserProfile"],
  ["USER_PREFERENCES_TABLE_NAME", "UserPreferences"],
  ["TRAINING_SESSION_TABLE_NAME", "TrainingSession"],
  ["RUNTIME_SNAPSHOT_TABLE_NAME", "RuntimeSnapshot"],
  ["SCENARIO_RUN_TABLE_NAME", "ScenarioRun"],
  ["SCORE_EVENT_TABLE_NAME", "ScoreEvent"],
  ["ATTESTATION_TABLE_NAME", "Attestation"],
  ["TENANT_SCORE_VISIBILITY_POLICY_TABLE_NAME", "TenantScoreVisibilityPolicy"],
  ["TENANT_TELEMETRY_POLICY_TABLE_NAME", "TenantTelemetryPolicy"],
] as const;

for (const [environmentName, modelName] of exportTables) {
  const table = requiredResource(backend.data.resources.tables[modelName], `${modelName} table`);
  table.grantReadData(userDataExportLambda);
  backend.userDataExport.addEnvironment(environmentName, table.tableName);
}
rawTelemetryTable.grantReadData(userDataExportLambda);
deletionPointerTable.grantReadData(userDataExportLambda);
backend.userDataExport.addEnvironment(
  "TELEMETRY_RAW_EVENT_TABLE_NAME",
  rawTelemetryTable.tableName,
);
backend.userDataExport.addEnvironment(
  "TELEMETRY_DELETION_POINTER_TABLE_NAME",
  deletionPointerTable.tableName,
);

new EventSourceMapping(backend.data.stack, "TelemetryAggregateProjectionStream", {
  target: projectorLambda,
  eventSourceArn: rawTelemetryStreamArn,
  startingPosition: StartingPosition.TRIM_HORIZON,
  reportBatchItemFailures: true,
});
