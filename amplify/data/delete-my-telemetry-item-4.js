import { util } from "@aws-appsync/utils";

const SLOT = 2;

export function request(ctx) {
  const targets = ctx.stash.telemetryDeletionTargets || [];
  const target = targets[SLOT];
  ctx.stash.telemetryDeletionCurrentExists = Boolean(target);
  return {
    operation: target ? "DeleteItem" : "GetItem",
    key: util.dynamodb.toMapValues({ id: target ? target.rawEventId : "telemetry-delete-noop:v1" }),
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  if (ctx.stash.telemetryDeletionCurrentExists) ctx.stash.telemetryDeletionCount += 1;
  return ctx.prev.result;
}
