import { ESLint } from "eslint";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Every resolver in amplify/data runs in the restricted APPSYNC_JS runtime. The AWS ESLint rules
// miss constructs AppSync only rejects at deployment: the first real deploy of the beta feedback
// resolvers failed on global String(...) calls, which this check had only covered for the
// attestation resolvers. Array.isArray and default parameter values are neither documented for
// APPSYNC_JS nor used by any resolver that has been deployed, so they are rejected as well.
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const resolverDirectory = `${repositoryRoot}amplify/data/`;
const resolverFiles = (await readdir(resolverDirectory, { withFileTypes: true }))
  .filter(
    (entry) => entry.isFile() && entry.name.endsWith(".js") && !entry.name.endsWith(".test.js"),
  )
  .map((entry) => `${resolverDirectory}${entry.name}`)
  .sort();

const unsupportedGlobalConversions = new Set(["Number", "String"]);
const diagnostics = [];

// ESLint resolves its flat config from its working directory, so it is pinned to the repository.
const eslint = new ESLint({ cwd: repositoryRoot });
const lintResults = await eslint.lintFiles(resolverFiles);
for (const result of lintResults) {
  for (const message of result.messages) {
    if (message.severity !== 2) continue;
    diagnostics.push({
      filePath: result.filePath,
      line: message.line,
      column: message.column,
      ruleId: message.ruleId ?? "eslint",
      message: message.message,
    });
  }
}

for (const filePath of resolverFiles) {
  const sourceText = await readFile(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.JS,
  );

  function report(node, ruleId, message) {
    const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    diagnostics.push({
      filePath,
      line: location.line + 1,
      column: location.character + 1,
      ruleId,
      message,
    });
  }

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      unsupportedGlobalConversions.has(node.expression.text)
    ) {
      report(
        node.expression,
        "appsync/no-unsupported-global-conversion",
        `APPSYNC_JS does not support the global ${node.expression.text}(...) conversion call.`,
      );
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "Array" &&
      node.expression.name.text === "isArray"
    ) {
      report(
        node.expression,
        "appsync/no-array-is-array",
        "Array.isArray is not part of the documented APPSYNC_JS runtime.",
      );
    }
    if (ts.isParameter(node) && node.initializer) {
      report(
        node,
        "appsync/no-default-parameter",
        "Default parameter values are not part of the documented APPSYNC_JS runtime.",
      );
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

if (diagnostics.length > 0) {
  for (const diagnostic of diagnostics) {
    console.error(
      `${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column} ${diagnostic.ruleId} ${diagnostic.message}`,
    );
  }
  console.error(`APPSYNC_JS validation failed with ${diagnostics.length} error(s).`);
  process.exitCode = 1;
} else {
  console.log(`APPSYNC_JS validation passed for ${resolverFiles.length} resolver(s).`);
}
