import assert from "node:assert/strict";
import test from "node:test";
import {
  executeTerminalCommand,
  formatTerminalPrompt,
  type TerminalCommandContext,
  type TerminalCommandResult,
} from "../../src/runtime/terminalCommandEngine.ts";

function baseContext(): TerminalCommandContext {
  return {
    workspaceRoot: "ai-training-demo",
    cwd: "",
    directories: ["src", "docs"],
    files: ["README.md", "hello.py", "src/app.py"],
    contents: {
      "README.md": "# Demo\n",
      "hello.py": 'print("Hello AI Training")\n',
      "src/app.py": 'print("Hello from src")\n',
    },
    committedContents: {
      "README.md": "# Demo\n",
      "src/app.py": 'print("Hello from src")\n',
    },
    trackedFiles: ["README.md", "src/app.py"],
    changedFiles: ["hello.py"],
    stagedFiles: [],
    stagedContents: {},
    commits: [],
  };
}

function nextContext(
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

test("terminal engine lists the simulated filesystem and runs Python in the current directory", () => {
  let context = baseContext();

  const rootListing = executeTerminalCommand("ls", context);
  assert.equal(rootListing.exitCode, 0);
  assert.deepEqual(rootListing.output, ["README.md  docs/  hello.py  src/"]);

  const changeDirectory = executeTerminalCommand("cd src", context);
  assert.equal(changeDirectory.exitCode, 0);
  assert.equal(changeDirectory.cwd, "src");
  context = nextContext(context, changeDirectory);
  assert.equal(
    formatTerminalPrompt(context.workspaceRoot, context.cwd),
    "user@lab:~/ai-training-demo/src$",
  );

  assert.deepEqual(executeTerminalCommand("ls", context).output, ["app.py"]);
  const python = executeTerminalCommand("python app.py", context);
  assert.equal(python.exitCode, 0);
  assert.deepEqual(python.output, ["Hello from src"]);

  const missingPython = executeTerminalCommand("python missing.py", context);
  assert.equal(missingPython.exitCode, 2);
  assert.match(missingPython.output.join("\n"), /No such file or directory/);
});

test("terminal engine accepts the absolute workspace paths printed by pwd", () => {
  let context = baseContext();

  const root = executeTerminalCommand("cd /home/user/ai-training-demo", context);
  assert.equal(root.exitCode, 0);
  assert.equal(root.cwd, "");
  context = nextContext(context, root);

  const nested = executeTerminalCommand("cd /home/user/ai-training-demo/src", context);
  assert.equal(nested.exitCode, 0);
  assert.equal(nested.cwd, "src");
  context = nextContext(context, nested);

  assert.deepEqual(executeTerminalCommand("pwd", context).output, [
    "/home/user/ai-training-demo/src",
  ]);
  assert.deepEqual(executeTerminalCommand("ls /home/user/ai-training-demo", context).output, [
    "README.md  docs/  hello.py  src/",
  ]);
});

test("terminal engine resolves a bare workspace name relative to the current directory", () => {
  let context = baseContext();

  const nested = executeTerminalCommand("cd src", context);
  assert.equal(nested.exitCode, 0);
  assert.equal(nested.cwd, "src");
  context = nextContext(context, nested);

  const bareWorkspace = executeTerminalCommand("cd ai-training-demo", context);
  assert.equal(bareWorkspace.exitCode, 1);
  assert.equal(bareWorkspace.cwd, "src");
  assert.match(bareWorkspace.output.join("\n"), /No such file or directory/);

  const explicitWorkspace = executeTerminalCommand("cd ~/ai-training-demo", context);
  assert.equal(explicitWorkspace.exitCode, 0);
  assert.equal(explicitWorkspace.cwd, "");
});

test("terminal engine stages and commits the actual changed files", () => {
  let context = baseContext();

  const statusBefore = executeTerminalCommand("git status", context);
  assert.match(statusBefore.output.join("\n"), /Untracked files:[\s\S]*hello\.py/);

  const add = executeTerminalCommand("git add hello.py", context);
  assert.equal(add.exitCode, 0);
  assert.deepEqual(add.stagedFiles, ["hello.py"]);
  assert.deepEqual(add.stagedFilesChanged, ["hello.py"]);
  context = nextContext(context, add);

  const commit = executeTerminalCommand('git commit -m "add hello example"', context);
  assert.equal(commit.exitCode, 0);
  assert.equal(commit.committed, true);
  assert.deepEqual(commit.stagedFilesChanged, []);
  assert.match(commit.output[0] ?? "", /\[main 0000001\] add hello example/);
  assert.deepEqual(commit.stagedFiles, []);
  assert.deepEqual(commit.changedFiles, []);
  assert.ok(commit.trackedFiles.includes("hello.py"));
  assert.deepEqual(commit.commits[0]?.files, ["hello.py"]);
  context = nextContext(context, commit);

  const statusAfter = executeTerminalCommand("git status", context);
  assert.match(statusAfter.output.join("\n"), /nothing to commit, working tree clean/);
});

test("terminal engine preserves edits made after git add as unstaged changes", () => {
  let context = baseContext();
  const add = executeTerminalCommand("git add hello.py", context);
  assert.deepEqual(add.stagedContents, {
    "hello.py": 'print("Hello AI Training")\n',
  });
  context = nextContext(context, add);
  context = {
    ...context,
    contents: {
      ...context.contents,
      "hello.py": 'print("Hello AI Training")\nprint("edited later")\n',
    },
  };

  const statusBeforeCommit = executeTerminalCommand("git status", context);
  assert.match(statusBeforeCommit.output.join("\n"), /Changes to be committed:[\s\S]*hello\.py/);
  assert.match(
    statusBeforeCommit.output.join("\n"),
    /Changes not staged for commit:[\s\S]*hello\.py/,
  );

  const commit = executeTerminalCommand('git commit -m "add initial hello"', context);
  assert.equal(commit.exitCode, 0);
  assert.match(commit.output.join("\n"), /1 insertion\(\+\)/);
  assert.deepEqual(commit.changedFiles, ["hello.py"]);
  assert.deepEqual(commit.stagedFiles, []);
  assert.deepEqual(commit.stagedContents, {});
  context = nextContext(context, commit);

  const statusAfterCommit = executeTerminalCommand("git status", context);
  assert.match(statusAfterCommit.output.join("\n"), /Changes not staged[\s\S]*hello\.py/);
  assert.doesNotMatch(statusAfterCommit.output.join("\n"), /working tree clean/);
});

test("terminal engine removes a staged tracked file when git add restores the committed baseline", () => {
  let context: TerminalCommandContext = {
    ...baseContext(),
    contents: {
      ...baseContext().contents,
      "README.md": "# Changed\n",
    },
    changedFiles: ["README.md"],
  };

  const firstAdd = executeTerminalCommand("git add README.md", context);
  assert.deepEqual(firstAdd.stagedFiles, ["README.md"]);
  assert.deepEqual(firstAdd.stagedContents, { "README.md": "# Changed\n" });
  context = nextContext(context, firstAdd);
  context = {
    ...context,
    contents: { ...context.contents, "README.md": "# Demo\n" },
    changedFiles: ["README.md"],
  };

  const secondAdd = executeTerminalCommand("git add README.md", context);
  assert.equal(secondAdd.exitCode, 0);
  assert.deepEqual(secondAdd.stagedFiles, []);
  assert.deepEqual(secondAdd.stagedContents, {});
  assert.deepEqual(secondAdd.changedFiles, []);
  assert.deepEqual(secondAdd.stagedFilesChanged, ["README.md"]);
  context = nextContext(context, secondAdd);

  const status = executeTerminalCommand("git status", context);
  assert.match(status.output.join("\n"), /nothing to commit, working tree clean/);
});

test("terminal engine returns realistic, helpful errors for invalid commands", () => {
  const context = baseContext();

  const commitWithoutStaging = executeTerminalCommand('git commit -m "too early"', context);
  assert.equal(commitWithoutStaging.exitCode, 1);
  assert.match(commitWithoutStaging.output.join("\n"), /nothing added to commit/);

  const gitTypo = executeTerminalCommand("git stats", context);
  assert.equal(gitTypo.exitCode, 1);
  assert.match(gitTypo.output.join("\n"), /not a git command/);

  const missingDirectory = executeTerminalCommand("cd examples", context);
  assert.equal(missingDirectory.exitCode, 1);
  assert.match(missingDirectory.output.join("\n"), /No such file or directory/);

  const missingGitPath = executeTerminalCommand("git add missing.py", context);
  assert.equal(missingGitPath.exitCode, 128);
  assert.deepEqual(missingGitPath.stagedFilesChanged, []);

  const unknownCommand = executeTerminalCommand("gti status", context);
  assert.equal(unknownCommand.exitCode, 127);
  assert.deepEqual(unknownCommand.output, ["bash: gti: command not found"]);
});
