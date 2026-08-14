import {
  executeTerminalCommand as executeBaseTerminalCommand,
  formatTerminalPrompt,
  type TerminalCommandContext as BaseTerminalCommandContext,
  type TerminalCommandResult as BaseTerminalCommandResult,
  type TerminalCommit,
} from "./terminalCommandEngine.ts";

export { formatTerminalPrompt };
export type { TerminalCommit };

export interface TerminalCommandContext extends BaseTerminalCommandContext {
  branch?: string;
}

export interface TerminalCommandResult extends BaseTerminalCommandResult {
  branch: string;
}

let simulatorBranch = "main";

export function setTerminalBranchContext(branch: string): void {
  simulatorBranch = branch.trim() || "main";
}

export function getTerminalBranchContext(): string {
  return simulatorBranch;
}

export function resetTerminalBranchContext(branch = "main"): void {
  setTerminalBranchContext(branch);
}

function currentBranch(context: TerminalCommandContext): string {
  return context.branch?.trim() || simulatorBranch || "main";
}

function resultFromContext(
  command: string,
  context: TerminalCommandContext,
  branch: string,
  output: string[],
  exitCode = 0,
): TerminalCommandResult {
  return {
    command,
    output,
    exitCode,
    clear: false,
    cwd: context.cwd,
    trackedFiles: [...context.trackedFiles],
    changedFiles: [...context.changedFiles],
    stagedFiles: [...context.stagedFiles],
    stagedContents: { ...context.stagedContents },
    commits: context.commits.map((commit) => ({ ...commit, files: [...commit.files] })),
    stagedFilesChanged: [],
    committed: false,
    branch,
  };
}

function validBranchName(value: string): boolean {
  return (
    Boolean(value) &&
    !value.startsWith("-") &&
    !value.includes("..") &&
    !value.endsWith("/") &&
    /^[A-Za-z0-9._/-]+$/.test(value)
  );
}

function branchCommand(
  command: string,
  tokens: string[],
  context: TerminalCommandContext,
  branch: string,
): TerminalCommandResult | null {
  if (tokens[0] !== "git") return null;

  if (tokens[1] === "branch") {
    if (tokens.length === 2) return resultFromContext(command, context, branch, [`* ${branch}`]);
    if (tokens.length === 3 && tokens[2] === "--show-current") {
      return resultFromContext(command, context, branch, [branch]);
    }
    return resultFromContext(command, context, branch, ["usage: git branch [--show-current]"], 1);
  }

  const createFlags =
    tokens[1] === "switch" ? ["-c", "--create"] : tokens[1] === "checkout" ? ["-b"] : [];
  if (!createFlags.length) return null;
  const flagIndex = tokens.findIndex((token) => createFlags.includes(token));
  const nextBranch = flagIndex >= 0 ? tokens[flagIndex + 1]?.trim() : undefined;
  if (!nextBranch || !validBranchName(nextBranch)) {
    return resultFromContext(command, context, branch, ["fatal: invalid branch name"], 128);
  }

  simulatorBranch = nextBranch;
  return resultFromContext(command, context, nextBranch, [
    `Switched to a new branch '${nextBranch}'`,
  ]);
}

function diffLines(before: string, after: string): string[] {
  if (before === after) return [];
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  return [
    `@@ -1,${Math.max(1, beforeLines.length)} +1,${Math.max(1, afterLines.length)} @@`,
    ...beforeLines.filter(Boolean).map((line) => `-${line}`),
    ...afterLines.filter(Boolean).map((line) => `+${line}`),
  ];
}

function diffCommand(
  command: string,
  tokens: string[],
  context: TerminalCommandContext,
  branch: string,
): TerminalCommandResult | null {
  if (tokens[0] !== "git" || tokens[1] !== "diff") return null;
  const staged = tokens.includes("--staged") || tokens.includes("--cached");
  const pathspecs = tokens.slice(2).filter((token) => token !== "--" && !token.startsWith("-"));
  const candidates = staged ? context.stagedFiles : context.changedFiles;
  const scopedCandidates = pathspecs.length
    ? candidates.filter((file) => pathspecs.includes(file))
    : candidates;
  const committedContents = context.committedContents ?? {};
  const stagedFiles = new Set(context.stagedFiles);
  const output: string[] = [];

  for (const file of [...new Set(scopedCandidates)]) {
    const committed = committedContents[file] ?? "";
    const before = staged
      ? committed
      : stagedFiles.has(file)
        ? (context.stagedContents[file] ?? committed)
        : committed;
    const after = staged
      ? (context.stagedContents[file] ?? committed)
      : (context.contents[file] ?? "");
    const patch = diffLines(before, after);
    if (!patch.length) continue;
    output.push(`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, ...patch);
  }

  return resultFromContext(command, context, branch, output);
}

function valueForName(
  name: string,
  firstParameter: string,
  secondParameter: string,
  variables: Readonly<Record<string, number>>,
): number | null {
  if (name === firstParameter) return 2;
  if (name === secondParameter) return 3;
  return variables[name] ?? null;
}

function evaluateAddExpression(
  rawExpression: string,
  firstParameter: string,
  secondParameter: string,
  variables: Readonly<Record<string, number>> = {},
): number | null {
  let expression = rawExpression.trim();
  if (/^\([^()]+\)$/.test(expression)) expression = expression.slice(1, -1).trim();
  if (/^-?\d+$/.test(expression)) return Number(expression);
  if (/^[A-Za-z_]\w*$/.test(expression)) {
    return valueForName(expression, firstParameter, secondParameter, variables);
  }

  const binary = /^([A-Za-z_]\w*|-?\d+)\s*([+*-])\s*([A-Za-z_]\w*|-?\d+)$/.exec(expression);
  if (binary) {
    const left = /^-?\d+$/.test(binary[1] ?? "")
      ? Number(binary[1])
      : valueForName(binary[1] ?? "", firstParameter, secondParameter, variables);
    const right = /^-?\d+$/.test(binary[3] ?? "")
      ? Number(binary[3])
      : valueForName(binary[3] ?? "", firstParameter, secondParameter, variables);
    if (left === null || right === null) return null;
    if (binary[2] === "+") return left + right;
    if (binary[2] === "-") return left - right;
    if (binary[2] === "*") return left * right;
  }

  const sum =
    /^sum\(\s*(?:\[\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*\]|\(\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*\))\s*\)$/.exec(
      expression,
    );
  if (!sum) return null;
  const firstName = sum[1] ?? sum[3] ?? "";
  const secondName = sum[2] ?? sum[4] ?? "";
  const first = valueForName(firstName, firstParameter, secondParameter, variables);
  const second = valueForName(secondName, firstParameter, secondParameter, variables);
  return first === null || second === null ? null : first + second;
}

interface AddDefinition {
  index: number;
  firstParameter: string;
  secondParameter: string;
}

function effectiveAddDefinition(lines: string[]): AddDefinition | null {
  let result: AddDefinition | null = null;
  const pattern =
    /^\s*def\s+add\(\s*([A-Za-z_]\w*)(?:\s*:\s*[^,]+)?\s*,\s*([A-Za-z_]\w*)(?:\s*:\s*[^)]+)?\s*\)\s*(?:->\s*[^:]+)?\s*:\s*$/;
  for (let index = 0; index < lines.length; index += 1) {
    const match = pattern.exec(lines[index] ?? "");
    if (!match) continue;
    result = {
      index,
      firstParameter: match[1] ?? "",
      secondParameter: match[2] ?? "",
    };
  }
  return result;
}

function indentationWidth(line: string): number {
  return line.length - line.trimStart().length;
}

function functionBodyIndent(lines: string[], definitionIndex: number): number | null {
  const definitionIndent = indentationWidth(lines[definitionIndex] ?? "");
  let bodyIndent: number | null = null;
  for (let index = definitionIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) continue;
    const indent = indentationWidth(line);
    if (indent <= definitionIndent) break;
    if (trimmed.startsWith("#")) continue;
    bodyIndent = bodyIndent === null ? indent : Math.min(bodyIndent, indent);
  }
  return bodyIndent;
}

function probeAddFunction(contents: string): number | null {
  const lines = contents.split("\n");
  const definition = effectiveAddDefinition(lines);
  if (!definition) return null;
  const definitionIndent = indentationWidth(lines[definition.index] ?? "");
  const bodyIndent = functionBodyIndent(lines, definition.index);
  if (bodyIndent === null) return null;
  const variables: Record<string, number> = {};

  for (let bodyIndex = definition.index + 1; bodyIndex < lines.length; bodyIndex += 1) {
    const line = lines[bodyIndex] ?? "";
    const trimmed = line.trim();
    if (!trimmed) continue;
    const indent = indentationWidth(line);
    if (indent <= definitionIndent) break;
    if (indent !== bodyIndent) continue;
    const code = (trimmed.split("#")[0] ?? "").trim();
    if (!code) continue;
    if (/^raise\b/.test(code)) return null;

    const assignment = /^([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(code);
    if (assignment) {
      const value = evaluateAddExpression(
        assignment[2] ?? "",
        definition.firstParameter,
        definition.secondParameter,
        variables,
      );
      if (value === null) return null;
      variables[assignment[1] ?? ""] = value;
      continue;
    }

    const returnStatement = /^return\s+(.+)$/.exec(code);
    if (!returnStatement) continue;
    return evaluateAddExpression(
      returnStatement[1] ?? "",
      definition.firstParameter,
      definition.secondParameter,
      variables,
    );
  }
  return null;
}

function topLevelRaiseBeforeCheck(contents: string): string | null {
  for (const line of contents.split("\n")) {
    if (!line.trim() || indentationWidth(line) !== 0) continue;
    const code = (line.trim().split("#")[0] ?? "").trim();
    if (/^print\((['"])CHECK: addition ready\1\)\s*$/.test(code)) return null;
    const raised = /^raise\s+(.+)$/.exec(code);
    if (raised) return raised[1] ?? "RuntimeError";
  }
  return null;
}

function verifyAdditionBehavior(
  result: BaseTerminalCommandResult,
  tokens: string[],
  context: TerminalCommandContext,
): BaseTerminalCommandResult {
  if (tokens[0] !== "python" && tokens[0] !== "python3") return result;
  const requested = tokens[1]?.replace(/^\.\//, "");
  if (!requested) return result;
  const path = [context.cwd, requested].filter(Boolean).join("/");
  const contents = context.contents[path] ?? context.contents[requested];
  if (contents === undefined) return result;

  const raised = topLevelRaiseBeforeCheck(contents);
  if (raised) {
    return {
      ...result,
      output: [`RuntimeError: ${raised}`],
      exitCode: 1,
    };
  }
  if (result.exitCode !== 0 || !result.output.includes("CHECK: addition ready")) return result;

  const probe = probeAddFunction(contents);
  if (probe === 5) return result;
  return {
    ...result,
    output: [
      probe === null
        ? "AssertionError: add(2, 3) could not be verified"
        : `AssertionError: add(2, 3) returned ${probe}; expected 5`,
    ],
    exitCode: 1,
  };
}

function withBranchOutput(
  result: BaseTerminalCommandResult,
  branch: string,
): TerminalCommandResult {
  const output = result.output.map((line) =>
    line
      .replace(/^On branch main$/, `On branch ${branch}`)
      .replace(
        /^Your branch is up to date with 'origin\/main'\.$/,
        `Your branch is up to date with 'origin/${branch}'.`,
      )
      .replace(/^\[main ([^\]]+)\](.*)$/, `[${branch} $1]$2`),
  );
  return { ...result, output, branch };
}

export function executeTerminalCommand(
  rawCommand: string,
  context: TerminalCommandContext,
): TerminalCommandResult {
  const command = rawCommand.trim();
  const branch = currentBranch(context);
  simulatorBranch = branch;
  const tokens = command.split(/\s+/).filter(Boolean);

  const branchResult = branchCommand(command, tokens, context, branch);
  if (branchResult) return branchResult;

  const diffResult = diffCommand(command, tokens, context, branch);
  if (diffResult) return diffResult;

  const baseResult = executeBaseTerminalCommand(command, context);
  return withBranchOutput(verifyAdditionBehavior(baseResult, tokens, context), branch);
}
