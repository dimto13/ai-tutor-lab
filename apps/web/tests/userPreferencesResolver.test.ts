import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const resolverUrl = new URL("../../../amplify/data/save-user-preferences.js", import.meta.url);

async function resolverSource(): Promise<string> {
  return readFile(resolverUrl, "utf8");
}

test("existing preferences use an object-shaped revision condition instead of a serialized condition", async () => {
  const source = await resolverSource();

  assert.match(source, /expression: "#preferencesVersion = :expectedRevision"/);
  assert.match(source, /expressionNames: \{ "#preferencesVersion": "preferencesVersion" \}/);
  assert.match(
    source,
    /expressionValues: util\.dynamodb\.toMapValues\(\{ ":expectedRevision": expectedRevision \}\)/,
  );
  assert.doesNotMatch(source, /toDynamoDBConditionExpression/);
  assert.match(source, /condition: revisionCondition\(expectedRevision\)/);
});

test("updating the AI level keeps every preference field on the shared save path", async () => {
  const source = await resolverSource();
  const preferenceFields = [
    "language",
    "preferredTrainingMode",
    "weeklyGoalMinutes",
    "accessibility",
    "selfAssessedAiLevel",
  ] as const;

  for (const field of preferenceFields) {
    assert.match(source, new RegExp(`${field}: ctx\\.args\\.${field} \\?\\? null`));
  }
});
