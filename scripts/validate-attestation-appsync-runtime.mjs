import { ESLint } from "eslint";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const resolverFiles = [
  "amplify/data/issue-attestation-write.js",
  "amplify/data/export-attestation.js",
];

const unsupportedGlobalConversions = new Set(["Number", "String"]);
const diagnostics = [];

const eslint = new ESLint();
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

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      unsupportedGlobalConversions.has(node.expression.text)
    ) {
      const location = sourceFile.getLineAndCharacterOfPosition(
        node.expression.getStart(sourceFile),
      );
      diagnostics.push({
        filePath,
        line: location.line + 1,
        column: location.character + 1,
        ruleId: "appsync/no-unsupported-global-conversion",
        message: `APPSYNC_JS does not support the global ${node.expression.text}(...) conversion call.`,
      });
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
  console.error(`Attestation APPSYNC_JS validation failed with ${diagnostics.length} error(s).`);
  process.exitCode = 1;
} else {
  console.log(`Attestation APPSYNC_JS validation passed for ${resolverFiles.length} resolver(s).`);
}
