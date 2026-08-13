import assert from "node:assert/strict";
import test from "node:test";
import {
  executeTerminalCommand,
  type TerminalCommandContext,
  type TerminalCommandResult,
} from "../../apps/web/src/runtime/terminalCommandEngine.ts";

function command(...parts: string[]): string {
  return parts.join(" ");
}

function contextAfter(
  context: TerminalCommandContext,
  result: TerminalCommandResult,
): TerminalCommandContext {
  return {
    ...context,
    cwd: result.cwd,
    trackedFiles: result.trackedFiles,
    changedFiles: result.changedFiles,
    stagedFiles: result.stagedFiles,
    stagedContents: result.stagedContents,
    commits: result.commits,
  };
}

test("commit output uses the active feature branch", () => {
  let context: TerminalCommandContext = {
    workspaceRoot: "ai-training-demo",
    cwd: "",
    directories: [],
    files: ["hello.py"],
    contents: { "hello.py": "hello\n" },
    committedContents: {},
    trackedFiles: [],
    changedFiles: ["hello.py"],
    stagedFiles: [],
    stagedContents: {},
    commits: [],
    branch: "feature/addition",
  };

  const staged = executeTerminalCommand(command("git", "add", "hello.py"), context);
  context = contextAfter(context, staged);
  const committed = executeTerminalCommand(
    command("git", "commit", "-m", '"add hello example"'),
    context,
  );

  assert.equal(committed.branch, "feature/addition");
  assert.match(committed.output[0] ?? "", /\[feature\/addition 0000001\] add hello example/);
});
