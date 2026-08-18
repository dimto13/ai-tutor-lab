import { util } from "@aws-appsync/utils";

const ITEM_INDEX = 6;

export function request(ctx) {
  const ids = ctx.stash.telemetryDeletionIds || [];
  const id = ids[ITEM_INDEX];
  ctx.stash.telemetryDeletionCurrentExists = typeof id === "string";
  return {
    operation: typeof id === "string" ? "DeleteItem" : "GetItem",
    key: util.dynamodb.toMapValues({ id: id || "telemetry-delete-noop:v1" }),
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  if (ctx.stash.telemetryDeletionCurrentExists) {
    ctx.stash.telemetryDeletionCount += 1;
  }
  return ctx.prev.result;
}
