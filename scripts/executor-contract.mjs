import { createHash } from "node:crypto";

export const reasons = [
  "CAPABILITY_MISMATCH",
  "STALLED",
  "CI_REPAIR",
  "LOCAL_RUNTIME_REQUIRED",
  "EXECUTOR_CAPACITY",
];
const actions = ["IMPLEMENT", "REPAIR", "TEST", "REBASE"];

function parseFields(text) {
  if (text.trim().startsWith("{")) return JSON.parse(text);
  const fields = {};
  for (const line of text.trim().split("\n")) {
    if (!line.trim()) continue;
    const match = /^([a-z][a-z-]*):\s*(.+)$/.exec(line);
    if (!match || Object.hasOwn(fields, match[1])) throw new Error("INVALID_DISPATCH_FIELDS");
    fields[match[1]] = /^[\[{"]/.test(match[2]) ? JSON.parse(match[2]) : match[2];
  }
  if (typeof fields.issue === "string" && /^\d+$/.test(fields.issue))
    fields.issue = Number(fields.issue);
  return fields;
}

export function parseDispatch(body) {
  // Examples in Markdown fences are documentation, never executable assignments.
  const operational = body.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "");
  const starts = [...operational.matchAll(/<!-- external-executor:v1\b/g)];
  if (!starts.length) return null; // The superseded jenkins-local-dispatch is deliberately ignored.
  if (starts.length !== 1)
    throw new Error("DISPATCH_COUNT: expected one external-executor request");
  const tail = operational.slice(starts[0].index + starts[0][0].length);
  const end = tail.indexOf("-->");
  if (end < 0) throw new Error("INVALID_DISPATCH: unterminated comment");
  const payload =
    tail.slice(0, end).trim() ||
    tail
      .slice(end + 3)
      .split(/\n\s*(?:## |<!--|```)/)[0]
      .trim();
  const data = parseFields(payload);
  if (["DISABLED", "CANCELLED", "PREPARED", "DONE"].includes(data.status)) return null;
  if (data.status !== "REQUESTED") throw new Error("INVALID_DISPATCH_STATUS");
  const scope = data.scope ?? data.allowedPaths;
  const allowedPaths =
    typeof scope === "string" ? scope.split(/\s*,\s*/).map((p) => p.trim()) : scope;
  if (
    !Number.isSafeInteger(data.issue) ||
    data.issue < 1 ||
    !reasons.includes(data.reason) ||
    !actions.includes(data.action) ||
    !/^[a-f0-9]{40}$/.test(data["basis-main"] ?? "") ||
    typeof data.acceptance !== "string" ||
    !data.acceptance.trim() ||
    data.acceptance.length > 20000 ||
    !Array.isArray(data.dependencies) ||
    data.dependencies.some((n) => !Number.isSafeInteger(n) || n < 1) ||
    data.merge !== "forbidden" ||
    data.deploy !== "forbidden" ||
    data["self-select-work"] !== "forbidden" ||
    !Array.isArray(allowedPaths) ||
    !allowedPaths.length ||
    allowedPaths.length > 30
  ) {
    throw new Error(
      "INVALID_DISPATCH: issue/reason/action/scope/acceptance/dependencies/basis and prohibitions required",
    );
  }
  for (const path of allowedPaths) {
    if (
      typeof path !== "string" ||
      !/^[a-zA-Z0-9_./-]+$/.test(path) ||
      path.startsWith("/") ||
      path.split("/").some((part) => part === ".." || part === ".") ||
      !/^(apps\/web\/|packages\/|tests\/)/.test(path)
    )
      throw new Error("INVALID_SCOPE: explicit application/package/test paths required");
  }
  const token =
    data.token ?? createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 24);
  const branch = data.branch ?? `owner/${data.issue}-external-${token.slice(0, 12)}`;
  if (
    !/^[a-zA-Z0-9_-]{1,80}$/.test(token) ||
    !new RegExp(`^owner/${data.issue}-[a-z0-9-]+$`).test(branch)
  )
    throw new Error("INVALID_DISPATCH_BRANCH");
  return {
    token,
    issue: data.issue,
    branch,
    allowedPaths,
    reason: data.reason,
    action: data.action,
    acceptance: data.acceptance,
    dependencies: data.dependencies,
    basisMain: data["basis-main"],
  };
}

export function updateSection(body, heading, content) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|\\n)## ${escaped}\\n[\\s\\S]*?(?=\\n## |$)`);
  return body.replace(pattern, "").trimEnd() + `\n\n## ${heading}\n\n${content.trim()}\n`;
}
