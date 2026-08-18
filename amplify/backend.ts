import { defineBackend } from "@aws-amplify/backend";
import { Stack } from "aws-cdk-lib";
import { EventSourceMapping, StartingPosition } from "aws-cdk-lib/aws-lambda";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { telemetryAggregateProjector } from "./functions/telemetry-aggregate-projector/resource";

function requiredResource<T>(resource: T | undefined, name: string): T {
  if (resource === undefined) throw new Error(`Missing generated backend resource: ${name}`);
  return resource;
}

const backend = defineBackend({
  auth,
  data,
  telemetryAggregateProjector,
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

new EventSourceMapping(Stack.of(rawTelemetryTable), "TelemetryAggregateProjectionStream", {
  target: projectorLambda,
  eventSourceArn: rawTelemetryStreamArn,
  startingPosition: StartingPosition.LATEST,
  reportBatchItemFailures: true,
});
