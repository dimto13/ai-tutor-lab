import { util } from "@aws-appsync/utils";

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).replaceAll("\r", " ").replaceAll("\n", " ");
  return `"${text.replaceAll('"', '""')}"`;
}

export function request() {
  return {};
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const items = Array.isArray(ctx.prev?.result) ? ctx.prev.result : [];
  const header = [
    "receivedAt",
    "clientTimestamp",
    "tenantId",
    "userId",
    "source",
    "kind",
    "scenarioId",
    "stepId",
    "mode",
    "runtimeAdapterId",
    "appVersion",
    "commit",
    "text",
  ];
  const rows = items.map((item) =>
    header.map((field) => csvCell(item?.[field])).join(","),
  );
  return [header.join(","), ...rows].join("\n");
}
