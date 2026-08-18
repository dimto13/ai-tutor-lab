import { util } from "@aws-appsync/utils";

const SLOT = 1;

export function request(ctx) {
  const targets = ctx.stash.telemetryDeletionTargets || [];
  const target = targets[SLOT];
  return {
    operation: target ? "DeleteItem" : "GetItem",
    key: util.dynamodb.toMapValues({ id: target ? target.pointerId : "telemetry-delete-noop:v1" }),
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  return ctx.prev.result;
}
