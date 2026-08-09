export interface TerminalCommit {
  hash: string;
  message: string;
  files: string[];
}

export interface TerminalCommandContext {
  workspaceRoot: string;
  cwd: string;
  directories: string[];
  files: string[];
  contents: Record<string, string>;
  trackedFiles: string[];
  changedFiles: string[];
  stagedFiles: string[];
  stagedContents: Record<string, string>;
  commits: TerminalCommit[];
}

export interface TerminalCommandResult {
  command: string;
  output: string[];
  exitCode: number;
  clear: boolean;
  cwd: string;
  trackedFiles: string[];
  changedFiles: string[];
  stagedFiles: string[];
  stagedContents: Record<string, string>;
  commits: TerminalCommit[];
  stagedFilesChanged: string[];
  committed: boolean;
}

interface ParsedCommand {
  tokens: string[];
  error?: string;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function normalizeStoredPath(value: string): string {
  const segments: string[] = [];
  for (const segment of value.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

function parentPath(value: string): string {
  const normalized = normalizeStoredPath(value);
  const separator = normalized.lastIndexOf("/");
  return separator < 0 ? "" : normalized.slice(0, separator);
}

function baseName(value: string): string {
  const normalized = normalizeStoredPath(value);
  const separator = normalized.lastIndexOf("/");
  return separator < 0 ? normalized : normalized.slice(separator + 1);
}

function knownDirectories(context: TerminalCommandContext): Set<string> {
  const directories = new Set<string>([""]);
  const candidates = [...context.directories, ...context.files.map(parentPath)];
  for (const candidate of candidates) {
    const segments = normalizeStoredPath(candidate).split("/").filter(Boolean);
    for (let index = 1; index <= segments.length; index += 1) {
      directories.add(segments.slice(0, index).join("/"));
    }
  }
  return directories;
}

function resolvePath(context: TerminalCommandContext, rawPath: string): string {
  const value = rawPath.trim();
  if (!value || value === "~" || value === "/" || value === context.workspaceRoot) return "";

  let relative = value;
  const absoluteWorkspaceRoot = `/home/user/${context.workspaceRoot}`;
  const homeWorkspaceRoot = `~/${context.workspaceRoot}`;
  if (relative === absoluteWorkspaceRoot) {
    relative = "";
  } else if (relative.startsWith(`${absoluteWorkspaceRoot}/`)) {
    relative = relative.slice(absoluteWorkspaceRoot.length + 1);
  } else if (relative === homeWorkspaceRoot) {
    relative = "";
  } else if (relative.startsWith(`${homeWorkspaceRoot}/`)) {
    relative = relative.slice(homeWorkspaceRoot.length + 1);
  } else if (relative.startsWith("~/")) {
    relative = relative.slice(2);
  } else if (relative.startsWith("/")) {
    relative = relative.slice(1);
  } else {
    relative = [context.cwd, relative].filter(Boolean).join("/");
  }
  return normalizeStoredPath(relative);
}

function absolutePath(context: TerminalCommandContext, relativePath = context.cwd): string {
  const suffix = normalizeStoredPath(relativePath);
  return `/home/user/${context.workspaceRoot}${suffix ? `/${suffix}` : ""}`;
}

export function formatTerminalPrompt(workspaceRoot: string, cwd: string): string {
  const root = workspaceRoot.trim() || "ai-training-demo";
  const suffix = normalizeStoredPath(cwd);
  return `user@lab:~/${root}${suffix ? `/${suffix}` : ""}$`;
}

function parseCommand(command: string): ParsedCommand {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  for (const character of command) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }

  if (quote) {
    return { tokens: [], error: `bash: unexpected EOF while looking for matching \`${quote}'` };
  }
  if (escaping) {
    return { tokens: [], error: "bash: syntax error: unexpected end of file" };
  }
  if (current) tokens.push(current);
  return { tokens };
}

function unchangedResult(
  command: string,
  context: TerminalCommandContext,
  output: string[],
  exitCode = 0,
  clear = false,
): TerminalCommandResult {
  return {
    command,
    output,
    exitCode,
    clear,
    cwd: context.cwd,
    trackedFiles: [...context.trackedFiles],
    changedFiles: [...context.changedFiles],
    stagedFiles: [...context.stagedFiles],
    stagedContents: { ...context.stagedContents },
    commits: context.commits.map((commit) => ({ ...commit, files: [...commit.files] })),
    stagedFilesChanged: [],
    committed: false,
  };
}

function runLs(
  command: string,
  tokens: string[],
  context: TerminalCommandContext,
): TerminalCommandResult {
  if (tokens.length > 2) {
    return unchangedResult(command, context, ["ls: too many arguments"], 1);
  }
  const target = resolvePath(context, tokens[1] ?? ".");
  const directories = knownDirectories(context);
  const files = new Set(context.files.map(normalizeStoredPath));

  if (files.has(target)) return unchangedResult(command, context, [baseName(target)]);
  if (!directories.has(target)) {
    return unchangedResult(
      command,
      context,
      [`ls: cannot access '${tokens[1] ?? target}': No such file or directory`],
      2,
    );
  }

  const entries = new Set<string>();
  for (const directory of directories) {
    if (directory && parentPath(directory) === target) entries.add(`${baseName(directory)}/`);
  }
  for (const file of files) {
    if (parentPath(file) === target) entries.add(baseName(file));
  }
  return unchangedResult(command, context, [[...entries].sort().join("  ")]);
}

function runCd(
  command: string,
  tokens: string[],
  context: TerminalCommandContext,
): TerminalCommandResult {
  if (tokens.length > 2) {
    return unchangedResult(command, context, ["bash: cd: too many arguments"], 1);
  }
  const requested = tokens[1] ?? "~";
  const target = resolvePath(context, requested);
  if (context.files.map(normalizeStoredPath).includes(target)) {
    return unchangedResult(command, context, [`bash: cd: ${requested}: Not a directory`], 1);
  }
  if (!knownDirectories(context).has(target)) {
    return unchangedResult(
      command,
      context,
      [`bash: cd: ${requested}: No such file or directory`],
      1,
    );
  }
  return { ...unchangedResult(command, context, []), cwd: target };
}

function pythonOutput(contents: string, filename: string): { output: string[]; exitCode: number } {
  const output: string[] = [];
  const lines = contents.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const printMatch = /^print\((['"])(.*)\1\)\s*$/.exec(trimmed);
    if (printMatch) {
      output.push((printMatch[2] ?? "").replaceAll("\\n", "\n"));
      continue;
    }
    if (trimmed.startsWith("print(")) {
      return {
        output: [
          `  File "${filename}", line ${index + 1}`,
          `    ${trimmed}`,
          "SyntaxError: invalid syntax",
        ],
        exitCode: 1,
      };
    }
  }
  return { output, exitCode: 0 };
}

function runPython(
  command: string,
  tokens: string[],
  context: TerminalCommandContext,
): TerminalCommandResult {
  const requested = tokens[1];
  if (!requested) {
    return unchangedResult(command, context, ["Python 3.12.4 (simulated)", ">>> exit()"]);
  }
  const filename = resolvePath(context, requested);
  const contents = context.contents[filename];
  if (!context.files.map(normalizeStoredPath).includes(filename) || contents === undefined) {
    return unchangedResult(
      command,
      context,
      [
        `python: can't open file '${absolutePath(context, filename)}': [Errno 2] No such file or directory`,
      ],
      2,
    );
  }
  const result = pythonOutput(contents, requested);
  return unchangedResult(command, context, result.output, result.exitCode);
}

function gitStatus(command: string, context: TerminalCommandContext): TerminalCommandResult {
  const tracked = new Set(context.trackedFiles);
  const staged = unique(context.stagedFiles).filter((file) => context.changedFiles.includes(file));
  const unstaged = context.changedFiles.filter(
    (file) =>
      !staged.includes(file) ||
      (Object.hasOwn(context.stagedContents, file) &&
        context.contents[file] !== context.stagedContents[file]),
  );
  const stagedNew = staged.filter((file) => !tracked.has(file));
  const stagedModified = staged.filter((file) => tracked.has(file));
  const untracked = unstaged.filter((file) => !tracked.has(file) && !staged.includes(file));
  const modified = unstaged.filter((file) => tracked.has(file) || staged.includes(file));
  const output = ["On branch main", "Your branch is up to date with 'origin/main'."];

  if (staged.length) {
    output.push("", "Changes to be committed:");
    for (const file of stagedNew) output.push(`\tnew file:   ${file}`);
    for (const file of stagedModified) output.push(`\tmodified:   ${file}`);
  }
  if (modified.length) {
    output.push("", "Changes not staged for commit:");
    for (const file of modified) output.push(`\tmodified:   ${file}`);
  }
  if (untracked.length) {
    output.push("", "Untracked files:");
    for (const file of untracked) output.push(`\t${file}`);
  }
  if (!staged.length && !unstaged.length) {
    output.push("", "nothing to commit, working tree clean");
  } else if (!staged.length) {
    output.push(
      "",
      'nothing added to commit but untracked or modified files present (use "git add" to track)',
    );
  }
  return unchangedResult(command, context, output);
}

function filesForGitPath(context: TerminalCommandContext, rawPath: string): string[] | null {
  const target = resolvePath(context, rawPath);
  if (rawPath === "." || knownDirectories(context).has(target)) {
    return context.changedFiles.filter(
      (file) => !target || file === target || file.startsWith(`${target}/`),
    );
  }
  if (context.files.map(normalizeStoredPath).includes(target)) {
    return context.changedFiles.includes(target) ? [target] : [];
  }
  return null;
}

function gitAdd(
  command: string,
  tokens: string[],
  context: TerminalCommandContext,
): TerminalCommandResult {
  const paths = tokens.slice(2);
  if (!paths.length) {
    return unchangedResult(
      command,
      context,
      ["Nothing specified, nothing added.", "hint: Maybe you wanted to say 'git add .'?"],
      1,
    );
  }

  const selected: string[] = [];
  for (const path of paths) {
    const matches = filesForGitPath(context, path);
    if (matches === null) {
      return unchangedResult(
        command,
        context,
        [`fatal: pathspec '${path}' did not match any files`],
        128,
      );
    }
    selected.push(...matches);
  }

  return {
    ...unchangedResult(command, context, []),
    stagedFiles: unique([...context.stagedFiles, ...selected]),
    stagedContents: selected.reduce(
      (contents, file) => ({ ...contents, [file]: context.contents[file] ?? "" }),
      { ...context.stagedContents },
    ),
    stagedFilesChanged: unique(selected),
  };
}

function gitCommit(
  command: string,
  tokens: string[],
  context: TerminalCommandContext,
): TerminalCommandResult {
  if (!context.stagedFiles.length) {
    return unchangedResult(
      command,
      context,
      ['nothing added to commit (use "git add" to track files)'],
      1,
    );
  }
  const messageFlag = tokens.indexOf("-m");
  const message = messageFlag >= 0 ? tokens[messageFlag + 1]?.trim() : undefined;
  if (!message) {
    return unchangedResult(
      command,
      context,
      ['error: commit message required; use git commit -m "your message"'],
      1,
    );
  }

  const committedFiles = unique(context.stagedFiles);
  const hash = (context.commits.length + 1).toString(16).padStart(7, "0");
  const commit: TerminalCommit = { hash, message, files: committedFiles };
  const insertions = committedFiles.reduce((total, file) => {
    const contents = context.stagedContents[file] ?? context.contents[file] ?? "";
    return total + contents.split("\n").filter((line) => line.length > 0).length;
  }, 0);
  const output = [
    `[main ${hash}] ${message}`,
    ` ${committedFiles.length} file${committedFiles.length === 1 ? "" : "s"} changed, ${insertions} insertion${insertions === 1 ? "" : "s"}(+)`,
  ];
  const tracked = new Set(context.trackedFiles);
  for (const file of committedFiles) {
    if (!tracked.has(file)) output.push(` create mode 100644 ${file}`);
  }

  return {
    ...unchangedResult(command, context, output),
    trackedFiles: unique([...context.trackedFiles, ...committedFiles]),
    changedFiles: context.changedFiles.filter(
      (file) =>
        !committedFiles.includes(file) ||
        (Object.hasOwn(context.stagedContents, file) &&
          context.contents[file] !== context.stagedContents[file]),
    ),
    stagedFiles: [],
    stagedContents: {},
    commits: [...context.commits, commit],
    committed: true,
  };
}

function runGit(
  command: string,
  tokens: string[],
  context: TerminalCommandContext,
): TerminalCommandResult {
  const subcommand = tokens[1];
  if (subcommand === "status") return gitStatus(command, context);
  if (subcommand === "add") return gitAdd(command, tokens, context);
  if (subcommand === "commit") return gitCommit(command, tokens, context);
  if (!subcommand) {
    return unchangedResult(
      command,
      context,
      ["usage: git <command> [<args>]", "Available commands: status, add, commit"],
      1,
    );
  }
  return unchangedResult(
    command,
    context,
    [`git: '${subcommand}' is not a git command. See 'git --help'.`],
    1,
  );
}

export function executeTerminalCommand(
  rawCommand: string,
  context: TerminalCommandContext,
): TerminalCommandResult {
  const command = rawCommand.trim();
  const parsed = parseCommand(command);
  if (parsed.error) return unchangedResult(command, context, [parsed.error], 2);
  const [program] = parsed.tokens;
  if (!program) return unchangedResult(command, context, []);

  if (program === "clear") return unchangedResult(command, context, [], 0, true);
  if (program === "pwd") {
    return unchangedResult(command, context, [absolutePath(context)]);
  }
  if (program === "ls") return runLs(command, parsed.tokens, context);
  if (program === "cd") return runCd(command, parsed.tokens, context);
  if (program === "python" || program === "python3") {
    return runPython(command, parsed.tokens, context);
  }
  if (program === "git") return runGit(command, parsed.tokens, context);

  return unchangedResult(command, context, [`bash: ${program}: command not found`], 127);
}
