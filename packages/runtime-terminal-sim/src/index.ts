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

  const createFlag = tokens[1] === "switch" ? "-c" : tokens[1] === "checkout" ? "-b" : null;
  if (!createFlag) return null;
  const flagIndex = tokens.indexOf(createFlag);
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
  const candidates = staged ? context.stagedFiles : context.changedFiles;
  const committedContents = context.committedContents ?? {};
  const output: string[] = [];

  for (const file of [...new Set(candidates)]) {
    const before = committedContents[file] ?? "";
    const after = staged
      ? (context.stagedContents[file] ?? before)
      : (context.contents[file] ?? "");
    const patch = diffLines(before, after);
    if (!patch.length) continue;
    output.push(`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, ...patch);
  }

  return resultFromContext(command, context, branch, output);
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
      .replace(/^\[main (.+)\]$/, `[${branch} $1]`),
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

  return withBranchOutput(executeBaseTerminalCommand(command, context), branch);
}
