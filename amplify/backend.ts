import { defineBackend } from "@aws-amplify/backend";
import { Stack } from "aws-cdk-lib";
import { EventSourceMapping, StartingPosition } from "aws-cdk-lib/aws-lambda";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { telemetryAggregateProjector } from "./functions/telemetry-aggregate-projector/resource";

const backend = defineBackend({
  auth,
  data,
  telemetryAggregateProjector,
});

const { cfnIdentityPool } = backend.auth.resources.cfnResources;
cfnIdentityPool.allowUnauthenticatedIdentities = false;

const { amplifyDynamoDbTables } = backend.data.resources.cfnResources;
for (const modelName of [
  "TrainingTelemetryEvent",
  "TrainingTelemetryDeletionPointer",
  "TrainingTelemetryProjectionReceipt",
]) {
  amplifyDynamoDbTables[modelName].timeToLiveAttribute = {
    attributeName: "expiresAtEpochSeconds",
    enabled: true,
  };
}

const rawTelemetryTable = backend.data.resources.tables["TrainingTelemetryEvent"];
const aggregateTable = backend.data.resources.tables["TrainingTelemetryAggregate"];
const projectionReceiptTable = backend.data.resources.tables["TrainingTelemetryProjectionReceipt"];
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
  eventSourceArn: rawTelemetryTable.tableStreamArn,
  startingPosition: StartingPosition.LATEST,
  reportBatchItemFailures: true,
});
