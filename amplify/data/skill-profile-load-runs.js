import { util } from "@aws-appsync/utils";

function runOwnerKey(subject) {
  return [
    "run-owner:v1",
    util.base64Encode(subject.tenantId),
    util.base64Encode(subject.userId),
  ].join(".");
}

export function request(ctx) {
  const subject = ctx.stash.skillSubject;
  if (!subject) {
    util.error("Skill profile subject is missing", "SkillProfilePipelineError");
  }

  return {
    operation: "Query",
    index: "scenarioRunsByOwnerTime",
    query: {
      expression: "ownerKey = :ownerKey",
      expressionValues: util.dynamodb.toMapValues({
        ":ownerKey": runOwnerKey(subject),
      }),
    },
    limit: 1000,
    scanIndexForward: false,
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const subject = ctx.stash.skillSubject;
  const items = ctx.result && ctx.result.items ? ctx.result.items : [];

  for (const item of items) {
    if (item.tenantId !== subject.tenantId || item.userId !== subject.userId) {
      util.error(
        "Scenario run query returned an item outside the authenticated owner scope",
        "SkillProfileScopeError",
      );
    }
  }

  ctx.stash.skillScenarioRuns = items;
  return items;
}
