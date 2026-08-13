import assert from "node:assert/strict";
import test from "node:test";
import {
  executeTerminalCommand,
  resetTerminalBranchContext,
  type TerminalCommandContext,
} from "../src/index.ts";

const action = (...parts: string[]): string => parts.join(" ");
const sourceControl = "git";

function createContext(): TerminalCommandContext {
  return {
    workspaceRoot: "ai-training-demo",
    cwd: "",
    directories: ["src"],
    files: ["src/app.py"],
    contents: { "src/app.py": 'print("Changed")\n' },
    committedContents: { "src/app.py": 'print("Original")\n' },
    trackedFiles: ["src/app.py"],
    changedFiles: ["src/app.py"],
    stagedFiles: [],
    stagedContents: {},
    commits: [],
  };
}

test("terminal workflow decorator keeps branch context across simulator actions", () => {
  resetTerminalBranchContext();
  const state = createContext();

  const switched = executeTerminalCommand(
    action(sourceControl, "switch", "-c", "feature/workflow"),
    state,
  );
  assert.equal(switched.exitCode, 0);
  assert.equal(switched.branch, "feature/workflow");

  const status = executeTerminalCommand(action(sourceControl, "status"), state);
  assert.equal(status.branch, "feature/workflow");
  assert.match(status.output.join("\n"), /On branch feature\/workflow/);
  assert.match(status.output.join("\n"), /origin\/feature\/workflow/);

  const current = executeTerminalCommand(
    action(sourceControl, "branch", "--show-current"),
    state,
  );
  assert.deepEqual(current.output, ["feature/workflow"]);
});

test("terminal workflow decorator exposes working-tree and staged diffs", () => {
  resetTerminalBranchContext("feature/review");
  const state = createContext();

  const diff = executeTerminalCommand(action(sourceControl, "diff"), state);
  assert.equal(diff.branch, "feature/review");
  assert.match(diff.output.join("\n"), /diff --git a\/src\/app\.py b\/src\/app\.py/);
  assert.match(diff.output.join("\n"), /-print\("Original"\)/);
  assert.match(diff.output.join("\n"), /\+print\("Changed"\)/);

  const stagedState: TerminalCommandContext = {
    ...state,
    stagedFiles: ["src/app.py"],
    stagedContents: { "src/app.py": 'print("Changed")\n' },
  };
  const stagedDiff = executeTerminalCommand(
    action(sourceControl, "diff", "--staged"),
    stagedState,
  );
  assert.match(stagedDiff.output.join("\n"), /\+print\("Changed"\)/);
});

test("terminal workflow decorator rejects invalid branch names", () => {
  resetTerminalBranchContext();
  const result = executeTerminalCommand(
    action(sourceControl, "checkout", "-b", "../invalid"),
    createContext(),
  );

  assert.equal(result.exitCode, 128);
  assert.equal(result.branch, "main");
  assert.match(result.output.join("\n"), /invalid branch name/);
});
