const PERSONAL_TABLE_ENVIRONMENTS = [
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
];

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function identityGroups(identity) {
  const direct = identity?.groups;
  if (Array.isArray(direct)) return direct;
  const claim = identity?.claims?.["cognito:groups"];
  if (Array.isArray(claim)) return claim;
  if (typeof claim === "string" && claim.length > 0) return claim.split(",");
  return [];
}

function caller(event) {
  const identity = event?.identity;
  const claimedSub = identity?.claims?.sub;
  const userId =
    typeof identity?.sub === "string" && identity.sub.length > 0
      ? identity.sub
      : typeof claimedSub === "string" && claimedSub.length > 0
        ? claimedSub
        : null;
  if (!userId) throw new Error("Unauthorized account deletion request");
  if (event?.arguments && Object.keys(event.arguments).length > 0) {
    throw new Error("Account deletion does not accept client-authoritative subject arguments");
  }

  let tenantId = null;
  for (const group of identityGroups(identity)) {
    if (typeof group !== "string" || !group.startsWith("tenant:")) continue;
    const candidate = group.slice("tenant:".length);
    if (!candidate) throw new Error("Invalid tenant membership");
    if (tenantId !== null && tenantId !== candidate) {
      throw new Error("Multiple tenant memberships require explicit tenant selection");
    }
    tenantId = candidate;
  }
  if (tenantId === null) throw new Error("Tenant membership is required for account deletion");
  return { userId, tenantId };
}

function encoded(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

function telemetryOwnerKey(subject) {
  return ["telemetry-deletion-owner:v1", encoded(subject.tenantId), encoded(subject.userId)].join(
    ".",
  );
}

function scanDescriptor(input) {
  return { service: "dynamodb", type: "scan", input };
}

function queryDescriptor(input) {
  return { service: "dynamodb", type: "query", input };
}

function deleteDescriptor(input) {
  return { service: "dynamodb", type: "delete", input };
}

async function deletePersonalTable(tableName, subject, send) {
  let deleted = 0;
  let exclusiveStartKey;
  do {
    const result = await send(
      scanDescriptor({
        TableName: tableName,
        ConsistentRead: true,
        FilterExpression: "#tenantId = :tenantId AND #userId = :userId",
        ExpressionAttributeNames: { "#tenantId": "tenantId", "#userId": "userId" },
        ExpressionAttributeValues: {
          ":tenantId": { S: subject.tenantId },
          ":userId": { S: subject.userId },
        },
        ProjectionExpression: "id, tenantId, userId",
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of result.Items || []) {
      if (
        item.tenantId?.S !== subject.tenantId ||
        item.userId?.S !== subject.userId ||
        !item.id?.S
      ) {
        throw new Error("Account deletion scan escaped authenticated subject scope");
      }
      await send(deleteDescriptor({ TableName: tableName, Key: { id: item.id } }));
      deleted += 1;
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return deleted;
}

async function deleteTelemetry(subject, send) {
  const pointerTable = requiredEnvironment("TELEMETRY_DELETION_POINTER_TABLE_NAME");
  const rawTable = requiredEnvironment("TELEMETRY_RAW_EVENT_TABLE_NAME");
  const ownerKey = telemetryOwnerKey(subject);
  let deleted = 0;
  let exclusiveStartKey;
  do {
    const result = await send(
      queryDescriptor({
        TableName: pointerTable,
        KeyConditionExpression: "ownerKey = :ownerKey",
        ExpressionAttributeValues: { ":ownerKey": { S: ownerKey } },
        ProjectionExpression: "tenantId, ownerKey, rawEventId",
        ConsistentRead: true,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of result.Items || []) {
      if (
        item.tenantId?.S !== subject.tenantId ||
        item.ownerKey?.S !== ownerKey ||
        !item.rawEventId?.S
      ) {
        throw new Error("Telemetry deletion query escaped authenticated subject scope");
      }
      await send(deleteDescriptor({ TableName: rawTable, Key: { id: item.rawEventId } }));
      await send(
        deleteDescriptor({
          TableName: pointerTable,
          Key: { ownerKey: item.ownerKey, rawEventId: item.rawEventId },
        }),
      );
      deleted += 1;
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return deleted;
}

async function deleteCognitoUser(subject, send) {
  const userPoolId = requiredEnvironment("USER_POOL_ID");
  const listed = await send({
    service: "cognito",
    type: "listUsers",
    input: { UserPoolId: userPoolId, Filter: `sub = \"${subject.userId}\"`, Limit: 2 },
  });
  const users = listed.Users || [];
  if (users.length !== 1 || !users[0]?.Username) {
    throw new Error(
      `Account deletion expected exactly one Cognito user for authenticated subject; found ${users.length}`,
    );
  }
  await send({
    service: "cognito",
    type: "adminDeleteUser",
    input: { UserPoolId: userPoolId, Username: users[0].Username },
  });
}

export function createAccountDeletionHandler(send) {
  return async (event) => {
    const subject = caller(event);
    try {
      for (const environmentName of PERSONAL_TABLE_ENVIRONMENTS) {
        await deletePersonalTable(requiredEnvironment(environmentName), subject, send);
      }
      await deleteTelemetry(subject, send);
    } catch (error) {
      throw new Error(`Account deletion stopped during personal-data deletion: ${error.message}`);
    }

    try {
      await deleteCognitoUser(subject, send);
    } catch (error) {
      throw new Error(
        `Personal data was deleted, but Cognito account deletion failed and must be retried: ${error.message}`,
      );
    }

    return true;
  };
}

let senderPromise;
async function awsSender() {
  if (!senderPromise) {
    senderPromise = Promise.all([
      import("@aws-sdk/client-dynamodb"),
      import("@aws-sdk/client-cognito-identity-provider"),
    ]).then(([dynamo, cognito]) => {
      const dynamoClient = new dynamo.DynamoDBClient({});
      const cognitoClient = new cognito.CognitoIdentityProviderClient({});
      return (descriptor) => {
        if (descriptor.service === "dynamodb" && descriptor.type === "scan") {
          return dynamoClient.send(new dynamo.ScanCommand(descriptor.input));
        }
        if (descriptor.service === "dynamodb" && descriptor.type === "query") {
          return dynamoClient.send(new dynamo.QueryCommand(descriptor.input));
        }
        if (descriptor.service === "dynamodb" && descriptor.type === "delete") {
          return dynamoClient.send(new dynamo.DeleteItemCommand(descriptor.input));
        }
        if (descriptor.service === "cognito" && descriptor.type === "listUsers") {
          return cognitoClient.send(new cognito.ListUsersCommand(descriptor.input));
        }
        if (descriptor.service === "cognito" && descriptor.type === "adminDeleteUser") {
          return cognitoClient.send(new cognito.AdminDeleteUserCommand(descriptor.input));
        }
        throw new Error("Unsupported account deletion command");
      };
    });
  }
  return senderPromise;
}

export async function handler(event) {
  const send = await awsSender();
  return createAccountDeletionHandler(send)(event);
}
