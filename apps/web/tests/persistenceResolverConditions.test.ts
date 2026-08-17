import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const dataDirectory = new URL("../../../amplify/data/", import.meta.url);

const revisionResolvers = [
  ["save-training-state.js", "revision"],
  ["save-runtime-snapshot.js", "revision"],
  ["delete-runtime-snapshot.js", "revision"],
  ["save-user-profile.js", "profileVersion"],
  ["save-user-preferences.js", "preferencesVersion"],
] as const;

async function resolverSource(fileName: string): Promise<string> {
  return readFile(new URL(fileName, dataDirectory), "utf8");
}

test("AppSync JavaScript resolvers do not serialize DynamoDB condition objects", async () => {
  const entries = await readdir(dataDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    const source = await resolverSource(entry.name);
    assert.doesNotMatch(
      source,
      /toDynamoDBConditionExpression/,
      `${entry.name} must pass an object-shaped condition to AppSync`,
    );
  }
});

test("revision-protected persistence resolvers use explicit object-shaped conditions", async () => {
  for (const [fileName, revisionAttribute] of revisionResolvers) {
    const source = await resolverSource(fileName);
    const expressionName = `#${revisionAttribute}`;

    assert.match(source, new RegExp(`expression: "${expressionName} = :expectedRevision"`));
    assert.match(
      source,
      new RegExp(`expressionNames: \\{ "${expressionName}": "${revisionAttribute}" \\}`),
    );
    assert.match(
      source,
      /expressionValues: util\.dynamodb\.toMapValues\(\{ ":expectedRevision": expectedRevision \}\)/,
    );
    assert.match(source, /condition: revisionCondition\(expectedRevision\)/);
  }
});

test("revision-protected persistence resolvers keep the create guard unchanged", async () => {
  for (const [fileName] of revisionResolvers) {
    const source = await resolverSource(fileName);
    assert.match(source, /return \{ expression: "attribute_not_exists\(id\)" \};/);
  }
});
