import { defineBackend } from "@aws-amplify/backend";
import { Stack } from "aws-cdk-lib";
import { AttributeType, BillingMode, StreamViewType, Table } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { EventSourceMapping, FunctionUrlAuthType, StartingPosition } from "aws-cdk-lib/aws-lambda";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { accountDeletion } from "./functions/account-deletion/resource";
import { runtimeIncidentReporter } from "./functions/runtime-incident-reporter/resource";
import { telemetryAggregateProjector } from "./functions/telemetry-aggregate-projector/resource";
import { telemetryDeletionWorker } from "./functions/telemetry-deletion-worker/resource";
import { tutorRelay } from "./functions/tutor-relay/resource";
import { userDataExport } from "./functions/user-data-export/resource";

function requiredResource<T>(resource: T | undefined, name: string): T {
  if (resource === undefined) throw new Error(`Missing generated backend resource: ${name}`);
  return resource;
}

export const backend = defineBackend({
  auth,
  data,
  accountDeletion,
  runtimeIncidentReporter,
  telemetryAggregateProjector,
  telemetryDeletionWorker,
  tutorRelay,
  userDataExport,
});

const { cfnIdentityPool, cfnUserPool } = backend.auth.resources.cfnResources;
cfnIdentityPool.allowUnauthenticatedIdentities = false;

const { amplifyDynamoDbTables } = backend.data.resources.cfnResources;
const rawTelemetryCfnTable = requiredResource(amplifyDynamoDbTables["TrainingTelemetryEvent"], "TrainingTelemetryEvent CfnTable");
const deletionPointerCfnTable = requiredResource(amplifyDynamoDbTables["TrainingTelemetryDeletionPointer"], "TrainingTelemetryDeletionPointer CfnTable");
const projectionReceiptCfnTable = requiredResource(amplifyDynamoDbTables["TrainingTelemetryProjectionReceipt"], "TrainingTelemetryProjectionReceipt CfnTable");
const betaFeedbackCfnTable = requiredResource(amplifyDynamoDbTables["BetaFeedback"], "BetaFeedback CfnTable");
const betaFeedbackAdmissionCfnTable = requiredResource(amplifyDynamoDbTables["BetaFeedbackAdmission"], "BetaFeedbackAdmission CfnTable");
rawTelemetryCfnTable.streamSpecification = { streamViewType: StreamViewType.NEW_IMAGE };
for (const table of [rawTelemetryCfnTable, deletionPointerCfnTable, projectionReceiptCfnTable, betaFeedbackCfnTable, betaFeedbackAdmissionCfnTable]) {
  table.timeToLiveAttribute = { attributeName: "expiresAtEpochSeconds", enabled: true };
}

const rawTelemetryTable = requiredResource(backend.data.resources.tables["TrainingTelemetryEvent"], "TrainingTelemetryEvent table");
const deletionPointerTable = requiredResource(backend.data.resources.tables["TrainingTelemetryDeletionPointer"], "TrainingTelemetryDeletionPointer table");
const aggregateTable = requiredResource(backend.data.resources.tables["TrainingTelemetryAggregate"], "TrainingTelemetryAggregate table");
const projectionReceiptTable = requiredResource(backend.data.resources.tables["TrainingTelemetryProjectionReceipt"], "TrainingTelemetryProjectionReceipt table");
const rawTelemetryStreamArn = requiredResource(rawTelemetryTable.tableStreamArn, "TrainingTelemetryEvent stream ARN");
const projectorLambda = backend.telemetryAggregateProjector.resources.lambda;
const deletionLambda = backend.telemetryDeletionWorker.resources.lambda;
const userDataExportLambda = backend.userDataExport.resources.lambda;
const accountDeletionLambda = backend.accountDeletion.resources.lambda;
const incidentLambda = backend.runtimeIncidentReporter.resources.lambda;

const runtimeIncidentTable = new Table(backend.data.stack, "RuntimeIncidentAggregate", {
  partitionKey: { name: "fingerprint", type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
});
runtimeIncidentTable.grantReadWriteData(incidentLambda);
backend.runtimeIncidentReporter.addEnvironment("RUNTIME_INCIDENT_TABLE_NAME", runtimeIncidentTable.tableName);
backend.runtimeIncidentReporter.addEnvironment("RUNTIME_INCIDENT_GITHUB_REPOSITORY", "dimto13/ai-tutor-lab");

aggregateTable.grantReadWriteData(projectorLambda);
projectionReceiptTable.grantReadWriteData(projectorLambda);
rawTelemetryTable.grantStreamRead(projectorLambda);
backend.telemetryAggregateProjector.addEnvironment("TELEMETRY_AGGREGATE_TABLE_NAME", aggregateTable.tableName);
backend.telemetryAggregateProjector.addEnvironment("TELEMETRY_PROJECTION_RECEIPT_TABLE_NAME", projectionReceiptTable.tableName);

rawTelemetryTable.grantReadWriteData(deletionLambda);
deletionPointerTable.grantReadWriteData(deletionLambda);
backend.telemetryDeletionWorker.addEnvironment("TELEMETRY_RAW_EVENT_TABLE_NAME", rawTelemetryTable.tableName);
backend.telemetryDeletionWorker.addEnvironment("TELEMETRY_DELETION_POINTER_TABLE_NAME", deletionPointerTable.tableName);

const personalTables = [
  ["USER_PROFILE_TABLE_NAME", "UserProfile"],
  ["USER_PREFERENCES_TABLE_NAME", "UserPreferences"],
  ["TRAINING_SESSION_TABLE_NAME", "TrainingSession"],
  ["STEP_STATE_TABLE_NAME", "StepState"],
  ["RUNTIME_SNAPSHOT_TABLE_NAME", "RuntimeSnapshot"],
  ["HINT_USAGE_TABLE_NAME", "HintUsage"],
  ["ATTEMPT_TABLE_NAME", "Attempt"],
  ["SCENARIO_RUN_TABLE_NAME", "ScenarioRun"],
  ["SCORE_EVENT_TABLE_NAME", "ScoreEvent"],
  ["SKILL_PROFILE_TABLE_NAME", "SkillProfile"],
  ["ATTESTATION_TABLE_NAME", "Attestation"],
] as const;

for (const [environmentName, modelName] of personalTables) {
  const table = requiredResource(backend.data.resources.tables[modelName], `${modelName} table`);
  table.grantReadData(userDataExportLambda);
  backend.userDataExport.addEnvironment(environmentName, table.tableName);
  table.grantReadWriteData(accountDeletionLambda);
  backend.accountDeletion.addEnvironment(environmentName, table.tableName);
}

const exportPolicyTables = [
  ["TENANT_SCORE_VISIBILITY_POLICY_TABLE_NAME", "TenantScoreVisibilityPolicy"],
  ["TENANT_TELEMETRY_POLICY_TABLE_NAME", "TenantTelemetryPolicy"],
] as const;
for (const [environmentName, modelName] of exportPolicyTables) {
  const table = requiredResource(backend.data.resources.tables[modelName], `${modelName} table`);
  table.grantReadData(userDataExportLambda);
  backend.userDataExport.addEnvironment(environmentName, table.tableName);
}

rawTelemetryTable.grantReadData(userDataExportLambda);
deletePointerAccess();
function deletePointerAccess() {
  deletionPointerTable.grantReadData(userDataExportLambda);
  backend.userDataExport.addEnvironment("TELEMETRY_RAW_EVENT_TABLE_NAME", rawTelemetryTable.tableName);
  backend.userDataExport.addEnvironment("TELEMETRY_DELETION_POINTER_TABLE_NAME", deletionPointerTable.tableName);

  rawTelemetryTable.grantReadWriteData(accountDeletionLambda);
  deletionPointerTable.grantReadWriteData(accountDeletionLambda);
  backend.accountDeletion.addEnvironment("TELEMETRY_RAW_EVENT_TABLE_NAME", rawTelemetryTable.tableName);
  backend.accountDeletion.addEnvironment("TELEMETRY_DELETION_POINTER_TABLE_NAME", deletionPointerTable.tableName);
}

accountDeletionLambda.addToRolePolicy(new PolicyStatement({
  actions: ["cognito-idp:AdminDeleteUser"],
  resources: [cfnUserPool.attrArn],
}));
backend.accountDeletion.addEnvironment("USER_POOL_ID", cfnUserPool.ref);

new EventSourceMapping(backend.data.stack, "TelemetryAggregateProjectionStream", {
  target: projectorLambda,
  eventSourceArn: rawTelemetryStreamArn,
  startingPosition: StartingPosition.TRIM_HORIZON,
  reportBatchItemFailures: true,
});

const TUTOR_RELAY_MANAGED_INSTANCE_ID = "mi-0c4f95e235b575da9";
const tutorRelayLambda = backend.tutorRelay.resources.lambda;
const tutorRelayStack = Stack.of(tutorRelayLambda);
tutorRelayLambda.addToRolePolicy(new PolicyStatement({
  actions: ["ssm:SendCommand"],
  resources: [
    `arn:aws:ssm:${tutorRelayStack.region}:${tutorRelayStack.account}:managed-instance/${TUTOR_RELAY_MANAGED_INSTANCE_ID}`,
    `arn:aws:ssm:${tutorRelayStack.region}::document/AWS-RunShellScript`,
  ],
}));
tutorRelayLambda.addToRolePolicy(new PolicyStatement({
  actions: ["ssm:GetCommandInvocation", "ssm:CancelCommand", "ssm:DescribeInstanceInformation"],
  resources: ["*"],
}));
backend.tutorRelay.addEnvironment("TUTOR_RELAY_MANAGED_INSTANCE_ID", TUTOR_RELAY_MANAGED_INSTANCE_ID);
const tutorRelayUrl = tutorRelayLambda.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });
backend.addOutput({ custom: { tutorRelayUrl: tutorRelayUrl.url } });
