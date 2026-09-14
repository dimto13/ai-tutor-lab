import { util } from "@aws-appsync/utils";

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t"];

// APPSYNC_JS has no global String(...) conversion and reads replaceAll() patterns as Java regular
// expressions, so the cell is converted by a template literal and escaped with split/join.
function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = `${value}`.split("\r").join(" ").split("\n").join(" ");
  const safeText = FORMULA_PREFIXES.includes(text.charAt(0)) ? `'${text}` : text;
  return `"${safeText.split('"').join('""')}"`;
}

export function request() {
  return {};
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const previous = ctx.prev ? ctx.prev.result : null;
  const items =
    previous && typeof previous === "object" && typeof previous.length === "number" ? previous : [];
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
  const rows = items.map((item) => header.map((field) => csvCell(item?.[field])).join(","));
  return [header.join(","), ...rows].join("\n");
}
