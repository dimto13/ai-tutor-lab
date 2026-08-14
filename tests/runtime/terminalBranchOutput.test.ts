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

test("git switch supports the documented --create long form", () => {
  const context: TerminalCommandContext = {
    workspaceRoot: "ai-training-demo",
    cwd: "",
    directories: [],
    files: [],
    contents: {},
    committedContents: {},
    trackedFiles: [],
    changedFiles: [],
    stagedFiles: [],
    stagedContents: {},
    commits: [],
    branch: "main",
  };

  const switched = executeTerminalCommand(
    command("git", "switch", "--create", "feature/addition"),
    context,
  );

  assert.equal(switched.exitCode, 0);
  assert.equal(switched.branch, "feature/addition");
  assert.deepEqual(switched.output, ["Switched to a new branch 'feature/addition'"]);
});

test("plain diff compares the working tree with the staged snapshot", () => {
  const context: TerminalCommandContext = {
    workspaceRoot: "ai-training-demo",
    cwd: "",
    directories: [],
    files: ["hello.py"],
    contents: { "hello.py": "value = 2\n" },
    committedContents: { "hello.py": "value = 1\n" },
    trackedFiles: ["hello.py"],
    changedFiles: ["hello.py"],
    stagedFiles: ["hello.py"],
    stagedContents: { "hello.py": "value = 2\n" },
    commits: [],
    branch: "feature/addition",
  };

  const unstaged = executeTerminalCommand(command("git", "diff"), context);
  assert.deepEqual(unstaged.output, []);

  const staged = executeTerminalCommand(command("git", "diff", "--staged"), context);
  assert.ok(staged.output.includes("-value = 1"));
  assert.ok(staged.output.includes("+value = 2"));

  const changedAfterStaging: TerminalCommandContext = {
    ...context,
    contents: { "hello.py": "value = 3\n" },
  };
  const laterUnstaged = executeTerminalCommand(command("git", "diff"), changedAfterStaging);
  assert.ok(laterUnstaged.output.includes("-value = 2"));
  assert.ok(laterUnstaged.output.includes("+value = 3"));
  assert.ok(!laterUnstaged.output.includes("-value = 1"));
});
