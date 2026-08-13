import {
  executeTerminalCommand as simulateTerminalCommand,
  formatTerminalPrompt,
  type TerminalCommandContext as EngineTerminalCommandContext,
  type TerminalCommandResult as EngineTerminalCommandResult,
  type TerminalCommit,
} from "./terminalCommandEngine.ts";

export type TerminalCommandContext = EngineTerminalCommandContext;
export type TerminalCommandResult = EngineTerminalCommandResult & { branch: string };
export type { TerminalCommit };
export { formatTerminalPrompt };

export type TerminalCommandInput = EngineTerminalCommandContext & {
  branch?: string;
};

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

function activeBranch(context: TerminalCommandInput): string {
  return context.branch?.trim() || simulatorBranch;
}

function unchangedResult(
  command: string,
  context: TerminalCommandInput,
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

function diffLines(before: string, after: string): string[] {
  if (before === after) return [];
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  return [
    `@@ -1,${Math.max(1, beforeLines.length)} +1,${Math.max(1, afterLines.length)} @@`,
    ...beforeLines.filter((line) => line.length > 0).map((line) => `-${line}`),
    ...afterLines.filter((line) => line.length > 0).map((line) => `+${line}`),
  ];
}

function simulatedGitDiff(
  command: string,
  tokens: string[],
  context: TerminalCommandInput,
  branch: string,
): TerminalCommandResult {
  const staged = tokens.includes("--staged") || tokens.includes("--cached");
  const committedContents = context.committedContents ?? {};
  const candidates = staged ? context.stagedFiles : context.changedFiles;
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

  return unchangedResult(command, context, branch, output);
}

function simulatedBranchCommand(
  command: string,
  tokens: string[],
  context: TerminalCommandInput,
  branch: string,
): TerminalCommandResult | null {
  if (tokens[0] !== "git") return null;

  if (tokens[1] === "branch") {
    if (tokens.length === 2) return unchangedResult(command, context, branch, [`* ${branch}`]);
    if (tokens.length === 3 && tokens[2] === "--show-current") {
      return unchangedResult(command, context, branch, [branch]);
    }
    return unchangedResult(command, context, branch, ["usage: git branch [--show-current]"], 1);
  }

  const createFlag = tokens[1] === "switch" ? "-c" : tokens[1] === "checkout" ? "-b" : null;
  if (createFlag) {
    if (tokens[2] !== createFlag) {
      return unchangedResult(command, context, branch, [`usage: git ${tokens[1]} ${createFlag} <new-branch>`], 1);
    }
    const nextBranch = tokens[3]?.trim() ?? "";
    if (!validBranchName(nextBranch)) {
      return unchangedResult(command, context, branch, ["fatal: invalid branch name"], 128);
    }
    return unchangedResult(command, context, nextBranch, [
      `Switched to a new branch '${nextBranch}'`,
    ]);
  }

  if (tokens[1] === "diff") return simulatedGitDiff(command, tokens, context, branch);
  return null;
}

function withBranchOutput(
  result: EngineTerminalCommandResult,
  branch: string,
): TerminalCommandResult {
  const output = [...result.output];
  if (result.command === "git status") {
    if (output.length > 0) output[0] = `On branch ${branch}`;
    if (output.length > 1) output[1] = `Your branch is up to date with 'origin/${branch}'.`;
  }
  if (result.committed && output.length > 0) {
    output[0] = (output[0] ?? "").replace(/^\[main /, `[${branch} `);
  }
  return { ...result, output, branch };
}

export function executeTerminalCommand(
  rawCommand: string,
  context: TerminalCommandInput,
): TerminalCommandResult {
  const command = rawCommand.trim();
  const branch = activeBranch(context);
  const tokens = command.split(/\s+/).filter(Boolean);
  const simulatedBranchResult = simulatedBranchCommand(command, tokens, context, branch);
  const result = simulatedBranchResult ?? withBranchOutput(simulateTerminalCommand(command, context), branch);
  simulatorBranch = result.branch;
  return result;
}
