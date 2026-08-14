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

test("git diff honors explicit pathspecs", () => {
  const context: TerminalCommandContext = {
    workspaceRoot: "ai-training-demo",
    cwd: "",
    directories: [],
    files: ["calculator.py", "notes.txt"],
    contents: {
      "calculator.py": "return a + b\n",
      "notes.txt": "local draft\n",
    },
    committedContents: {
      "calculator.py": "# TODO\n",
      "notes.txt": "local note\n",
    },
    trackedFiles: ["calculator.py", "notes.txt"],
    changedFiles: ["calculator.py", "notes.txt"],
    stagedFiles: [],
    stagedContents: {},
    commits: [],
    branch: "feature/addition",
  };

  const calculatorDiff = executeTerminalCommand(command("git", "diff", "calculator.py"), context);
  assert.ok(calculatorDiff.output.includes("diff --git a/calculator.py b/calculator.py"));
  assert.ok(!calculatorDiff.output.some((line) => line.includes("notes.txt")));

  const notesDiff = executeTerminalCommand(command("git", "diff", "--", "notes.txt"), context);
  assert.ok(notesDiff.output.includes("diff --git a/notes.txt b/notes.txt"));
  assert.ok(!notesDiff.output.some((line) => line.includes("calculator.py")));
});

test("python verification checks add behavior rather than source hints", () => {
  const baseContext: TerminalCommandContext = {
    workspaceRoot: "ai-training-demo",
    cwd: "",
    directories: [],
    files: ["calculator.py"],
    contents: {},
    committedContents: {},
    trackedFiles: ["calculator.py"],
    changedFiles: ["calculator.py"],
    stagedFiles: [],
    stagedContents: {},
    commits: [],
    branch: "feature/addition",
  };

  const invalid = executeTerminalCommand(command("python", "calculator.py"), {
    ...baseContext,
    contents: {
      "calculator.py": 'def add(a, b):\n    return a - b  # +\n\nprint("CHECK: addition ready")\n',
    },
  });
  assert.equal(invalid.exitCode, 1);
  assert.ok(invalid.output.some((line) => line.includes("returned -1; expected 5")));
  assert.ok(!invalid.output.includes("CHECK: addition ready"));

  const valid = executeTerminalCommand(command("python3", "calculator.py"), {
    ...baseContext,
    contents: {
      "calculator.py": 'def add(a, b):\n    return sum([b, a])\n\nprint("CHECK: addition ready")\n',
    },
  });
  assert.equal(valid.exitCode, 0);
  assert.ok(valid.output.includes("CHECK: addition ready"));
});

test("python verification uses the last effective add definition", () => {
  const context: TerminalCommandContext = {
    workspaceRoot: "ai-training-demo",
    cwd: "",
    directories: [],
    files: ["calculator.py"],
    contents: {
      "calculator.py":
        'def add(a, b):\n    return a + b\n\ndef add(a, b):\n    return a - b\n\nprint("CHECK: addition ready")\n',
    },
    committedContents: {},
    trackedFiles: ["calculator.py"],
    changedFiles: ["calculator.py"],
    stagedFiles: [],
    stagedContents: {},
    commits: [],
    branch: "feature/addition",
  };

  const result = executeTerminalCommand(command("python", "calculator.py"), context);
  assert.equal(result.exitCode, 1);
  assert.ok(result.output.some((line) => line.includes("returned -1; expected 5")));
});

test("python verification accepts typed add signatures", () => {
  const context: TerminalCommandContext = {
    workspaceRoot: "ai-training-demo",
    cwd: "",
    directories: [],
    files: ["calculator.py"],
    contents: {
      "calculator.py":
        'def add(a: int, b: int) -> int:\n    return a + b\n\nprint("CHECK: addition ready")\n',
    },
    committedContents: {},
    trackedFiles: ["calculator.py"],
    changedFiles: ["calculator.py"],
    stagedFiles: [],
    stagedContents: {},
    commits: [],
    branch: "feature/addition",
  };

  const result = executeTerminalCommand(command("python3", "calculator.py"), context);
  assert.equal(result.exitCode, 0);
  assert.ok(result.output.includes("CHECK: addition ready"));
});

test("python verification ignores nested unreachable returns", () => {
  const context: TerminalCommandContext = {
    workspaceRoot: "ai-training-demo",
    cwd: "",
    directories: [],
    files: ["calculator.py"],
    contents: {
      "calculator.py":
        'def add(a, b):\n    if False:\n        return a + b\n    return a - b\n\nprint("CHECK: addition ready")\n',
    },
    committedContents: {},
    trackedFiles: ["calculator.py"],
    changedFiles: ["calculator.py"],
    stagedFiles: [],
    stagedContents: {},
    commits: [],
    branch: "feature/addition",
  };

  const result = executeTerminalCommand(command("python", "calculator.py"), context);
  assert.equal(result.exitCode, 1);
  assert.ok(result.output.some((line) => line.includes("returned -1; expected 5")));
});

test("python verification accepts local variables before return", () => {
  const context: TerminalCommandContext = {
    workspaceRoot: "ai-training-demo",
    cwd: "",
    directories: [],
    files: ["calculator.py"],
    contents: {
      "calculator.py":
        'def add(a, b):\n    result = a + b\n    return result\n\nprint("CHECK: addition ready")\n',
    },
    committedContents: {},
    trackedFiles: ["calculator.py"],
    changedFiles: ["calculator.py"],
    stagedFiles: [],
    stagedContents: {},
    commits: [],
    branch: "feature/addition",
  };

  const result = executeTerminalCommand(command("python", "calculator.py"), context);
  assert.equal(result.exitCode, 0);
  assert.ok(result.output.includes("CHECK: addition ready"));
});

test("python verification fails on top-level raise before CHECK output", () => {
  const context: TerminalCommandContext = {
    workspaceRoot: "ai-training-demo",
    cwd: "",
    directories: [],
    files: ["calculator.py"],
    contents: {
      "calculator.py":
        'def add(a, b):\n    return a + b\n\nraise RuntimeError("boom")\nprint("CHECK: addition ready")\n',
    },
    committedContents: {},
    trackedFiles: ["calculator.py"],
    changedFiles: ["calculator.py"],
    stagedFiles: [],
    stagedContents: {},
    commits: [],
    branch: "feature/addition",
  };

  const result = executeTerminalCommand(command("python", "calculator.py"), context);
  assert.equal(result.exitCode, 1);
  assert.ok(result.output.some((line) => line.includes("RuntimeError")));
  assert.ok(!result.output.includes("CHECK: addition ready"));
});
