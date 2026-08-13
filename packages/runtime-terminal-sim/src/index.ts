import {
  executeTerminalCommand as simulateTerminalCommand,
  formatTerminalPrompt,
  type TerminalCommandContext,
  type TerminalCommandResult,
  type TerminalCommit,
} from "./terminalCommandEngine.ts";

export type { TerminalCommandContext, TerminalCommandResult, TerminalCommit };
export { formatTerminalPrompt };

export type TerminalCommandInput = Omit<TerminalCommandContext, "branch"> & {
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

export function executeTerminalCommand(
  command: string,
  context: TerminalCommandInput,
): TerminalCommandResult {
  const result = simulateTerminalCommand(command, {
    ...context,
    branch: context.branch?.trim() || simulatorBranch,
  });
  simulatorBranch = result.branch;
  return result;
}
