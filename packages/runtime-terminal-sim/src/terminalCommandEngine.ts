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
  committedContents?: Record<string, string>;
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
  if (!value || value === "~" || value === "/") return "";

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

type PythonScalar = number | string | boolean;

interface PythonFunction {
  parameters: string[];
  bodyStart: number;
  bodyEnd: number;
  bodyIndent: number;
}

interface PythonExecutionContext {
  lines: string[];
  functions: Map<string, PythonFunction>;
  variables: Record<string, PythonScalar>;
}

function indentationWidth(line: string): number {
  return line.length - line.trimStart().length;
}

function splitArguments(value: string): string[] {
  const argumentsList: string[] = [];
  let depth = 0;
  let quote: "'" | '"' | null = null;
  let current = "";
  for (const character of value) {
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      current += character;
      continue;
    }
    if (character === "(" || character === "[") depth += 1;
    if (character === ")" || character === "]") depth -= 1;
    if (character === "," && depth === 0) {
      argumentsList.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) argumentsList.push(current.trim());
  return argumentsList;
}

function stripOuterParentheses(value: string): string {
  let result = value.trim();
  while (result.startsWith("(") && result.endsWith(")")) {
    let depth = 0;
    let wrapsWholeValue = true;
    for (let index = 0; index < result.length; index += 1) {
      const character = result[index];
      if (character === "(") depth += 1;
      if (character === ")") depth -= 1;
      if (depth === 0 && index < result.length - 1) {
        wrapsWholeValue = false;
        break;
      }
    }
    if (!wrapsWholeValue) break;
    result = result.slice(1, -1).trim();
  }
  return result;
}

function findTopLevelOperator(
  value: string,
  operators: string[],
): { index: number; operator: string } | null {
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? "";
    if (quote) {
      if (character === quote && value[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "(" || character === "[") depth += 1;
    if (character === ")" || character === "]") depth -= 1;
    if (depth !== 0) continue;
    for (const operator of operators) {
      if (value.startsWith(operator, index)) return { index, operator };
    }
  }
  return null;
}

function pythonError(type: string, detail = ""): Error {
  return new Error(`${type}${detail ? `: ${detail}` : ""}`);
}

function evaluatePythonExpression(
  rawExpression: string,
  execution: PythonExecutionContext,
  localVariables: Record<string, PythonScalar> = execution.variables,
): PythonScalar {
  const expression = stripOuterParentheses(rawExpression);
  const equality = findTopLevelOperator(expression, ["==", "!="]);
  if (equality) {
    const left = evaluatePythonExpression(
      expression.slice(0, equality.index),
      execution,
      localVariables,
    );
    const right = evaluatePythonExpression(
      expression.slice(equality.index + equality.operator.length),
      execution,
      localVariables,
    );
    return equality.operator === "==" ? left === right : left !== right;
  }

  const binary = findTopLevelOperator(expression, ["+", "-", "*"]);
  if (binary && binary.index > 0) {
    const left = evaluatePythonExpression(
      expression.slice(0, binary.index),
      execution,
      localVariables,
    );
    const right = evaluatePythonExpression(
      expression.slice(binary.index + binary.operator.length),
      execution,
      localVariables,
    );
    if (typeof left !== "number" || typeof right !== "number") {
      throw pythonError("TypeError", "unsupported operand type");
    }
    if (binary.operator === "+") return left + right;
    if (binary.operator === "-") return left - right;
    return left * right;
  }

  if (/^-?\d+$/.test(expression)) return Number(expression);
  const stringLiteral = /^(['"])(.*)\1$/.exec(expression);
  if (stringLiteral) return (stringLiteral[2] ?? "").replaceAll("\\n", "\n");
  if (expression === "True") return true;
  if (expression === "False") return false;

  const sumMatch = /^sum\(\s*[\[(](.*)[\])]\s*\)$/.exec(expression);
  if (sumMatch) {
    const values = splitArguments(sumMatch[1] ?? "").map((item) =>
      evaluatePythonExpression(item, execution, localVariables),
    );
    if (values.some((value) => typeof value !== "number")) {
      throw pythonError("TypeError", "sum expects numbers");
    }
    return (values as number[]).reduce((total, value) => total + value, 0);
  }

  const call = /^([A-Za-z_]\w*)\((.*)\)$/.exec(expression);
  if (call) {
    const functionName = call[1] ?? "";
    const args = splitArguments(call[2] ?? "").map((item) =>
      evaluatePythonExpression(item, execution, localVariables),
    );
    return executePythonFunction(functionName, args, execution);
  }

  if (Object.hasOwn(localVariables, expression)) return localVariables[expression]!;
  throw pythonError("NameError", `name '${expression}' is not defined`);
}

function executePythonFunction(
  name: string,
  args: PythonScalar[],
  execution: PythonExecutionContext,
): PythonScalar {
  const definition = execution.functions.get(name);
  if (!definition) throw pythonError("NameError", `name '${name}' is not defined`);
  if (args.length !== definition.parameters.length) {
    throw pythonError("TypeError", `${name}() received the wrong number of arguments`);
  }
  const locals: Record<string, PythonScalar> = {};
  definition.parameters.forEach((parameter, index) => {
    locals[parameter] = args[index]!;
  });

  for (let index = definition.bodyStart; index < definition.bodyEnd; index += 1) {
    const line = execution.lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (indentationWidth(line) !== definition.bodyIndent) continue;
    const code = (trimmed.split("#")[0] ?? "").trim();
    if (!code || code === "pass") continue;
    const raiseStatement = /^raise(?:\s+(.+))?$/.exec(code);
    if (raiseStatement) throw pythonError("RuntimeError", raiseStatement[1] ?? "raised");
    const assignment = /^([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(code);
    if (assignment) {
      locals[assignment[1] ?? ""] = evaluatePythonExpression(
        assignment[2] ?? "",
        execution,
        locals,
      );
      continue;
    }
    const returnStatement = /^return(?:\s+(.+))?$/.exec(code);
    if (returnStatement) {
      return returnStatement[1]
        ? evaluatePythonExpression(returnStatement[1], execution, locals)
        : false;
    }
  }
  throw pythonError("RuntimeError", `${name}() completed without a return value`);
}

function collectPythonFunctions(lines: string[]): Map<string, PythonFunction> {
  const functions = new Map<string, PythonFunction>();
  const definitionPattern = /^\s*def\s+([A-Za-z_]\w*)\(\s*([^)]*)\)\s*(?:->\s*[^:]+)?\s*:\s*$/;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (indentationWidth(line) !== 0) continue;
    const match = definitionPattern.exec(line);
    if (!match) continue;
    const parameters = splitArguments(match[2] ?? "").map((parameter) =>
      (parameter.split(":")[0] ?? "").trim(),
    );
    let bodyStart = index + 1;
    let bodyEnd = lines.length;
    let bodyIndent = 0;
    for (let bodyIndex = index + 1; bodyIndex < lines.length; bodyIndex += 1) {
      const bodyLine = lines[bodyIndex] ?? "";
      if (!bodyLine.trim()) continue;
      const indent = indentationWidth(bodyLine);
      if (indent === 0) {
        bodyEnd = bodyIndex;
        break;
      }
      if (bodyIndent === 0 && !bodyLine.trim().startsWith("#")) bodyIndent = indent;
    }
    functions.set(match[1] ?? "", { parameters, bodyStart, bodyEnd, bodyIndent });
    index = Math.max(index, bodyEnd - 1);
  }
  return functions;
}

function pythonOutput(contents: string, filename: string): { output: string[]; exitCode: number } {
  const output: string[] = [];
  const lines = contents.split("\n");
  const execution: PythonExecutionContext = {
    lines,
    functions: collectPythonFunctions(lines),
    variables: {},
  };

  try {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (indentationWidth(line) !== 0) continue;

      const definition = /^def\s+([A-Za-z_]\w*)\(/.exec(trimmed);
      if (definition) {
        const registered = execution.functions.get(definition[1] ?? "");
        if (registered) index = Math.max(index, registered.bodyEnd - 1);
        continue;
      }

      const code = (trimmed.split("#")[0] ?? "").trim();
      const assertStatement = /^assert\s+(.+)$/.exec(code);
      if (assertStatement) {
        const value = evaluatePythonExpression(assertStatement[1] ?? "", execution);
        if (value !== true) throw pythonError("AssertionError");
        continue;
      }

      const raiseStatement = /^raise(?:\s+(.+))?$/.exec(code);
      if (raiseStatement) throw pythonError("RuntimeError", raiseStatement[1] ?? "raised");

      const assignment = /^([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(code);
      if (assignment) {
        execution.variables[assignment[1] ?? ""] = evaluatePythonExpression(
          assignment[2] ?? "",
          execution,
        );
        continue;
      }

      const printMatch = /^print\((.*)\)\s*$/.exec(code);
      if (printMatch) {
        const value = evaluatePythonExpression(printMatch[1] ?? "", execution);
        output.push(String(value));
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "RuntimeError";
    return { output: [...output, message], exitCode: 1 };
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

  const selectedFiles = unique(selected);
  const tracked = new Set(context.trackedFiles);
  const committedContents = context.committedContents ?? {};
  const noOpFiles = selectedFiles.filter(
    (file) =>
      tracked.has(file) &&
      Object.hasOwn(committedContents, file) &&
      context.contents[file] === committedContents[file],
  );
  const noOpSet = new Set(noOpFiles);
  const filesToStage = selectedFiles.filter((file) => !noOpSet.has(file));
  const stagedContents = { ...context.stagedContents };
  for (const file of noOpFiles) delete stagedContents[file];
  for (const file of filesToStage) stagedContents[file] = context.contents[file] ?? "";
  const stagedFilesChanged = selectedFiles.filter((file) => {
    if (noOpSet.has(file)) return context.stagedFiles.includes(file);
    return (
      !context.stagedFiles.includes(file) || context.stagedContents[file] !== context.contents[file]
    );
  });

  return {
    ...unchangedResult(command, context, []),
    changedFiles: context.changedFiles.filter((file) => !noOpSet.has(file)),
    stagedFiles: unique([
      ...context.stagedFiles.filter((file) => !noOpSet.has(file)),
      ...filesToStage,
    ]),
    stagedContents,
    stagedFilesChanged,
  };
}

function gitRestore(
  command: string,
  tokens: string[],
  context: TerminalCommandContext,
): TerminalCommandResult {
  if (tokens[2] !== "--staged" || tokens.length < 4) {
    return unchangedResult(command, context, ["usage: git restore --staged <path>..."], 1);
  }

  const selected: string[] = [];
  for (const path of tokens.slice(3)) {
    const matches = filesForGitPath(context, path);
    if (matches === null) {
      return unchangedResult(
        command,
        context,
        [`error: pathspec '${path}' did not match any file(s) known to git`],
        1,
      );
    }
    selected.push(...matches);
  }

  const filesToUnstage = unique(selected).filter((file) => context.stagedFiles.includes(file));
  const stagedContents = { ...context.stagedContents };
  for (const file of filesToUnstage) delete stagedContents[file];

  return {
    ...unchangedResult(command, context, []),
    stagedFiles: context.stagedFiles.filter((file) => !filesToUnstage.includes(file)),
    stagedContents,
    stagedFilesChanged: filesToUnstage,
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
  const trackedFiles = new Set(context.trackedFiles);
  for (const file of committedFiles) {
    if (!trackedFiles.has(file)) output.push(` create mode 100644 ${file}`);
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
  if (subcommand === "restore") return gitRestore(command, tokens, context);
  if (subcommand === "commit") return gitCommit(command, tokens, context);
  if (!subcommand) {
    return unchangedResult(
      command,
      context,
      ["usage: git <command> [<args>]", "Available commands: status, add, restore, commit"],
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
