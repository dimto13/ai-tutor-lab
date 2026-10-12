import assert from "node:assert/strict";
import test from "node:test";
import { decodeAwsJson, encodeAwsJson } from "../src/adapters/awsJson.ts";

test("encodes values as the JSON string AppSync expects for AWSJSON", () => {
  assert.equal(
    encodeAwsJson({ finishedAt: 1, statuses: { a: "COMPLETED" } }),
    '{"finishedAt":1,"statuses":{"a":"COMPLETED"}}',
  );
  assert.equal(encodeAwsJson(null), "null");
  assert.throws(() => encodeAwsJson(undefined), /cannot be sent as AWSJSON/);
});

test("decodes AWSJSON strings and passes parsed values and null through", () => {
  assert.deepEqual(decodeAwsJson('{"finishedAt":1}', "payload"), { finishedAt: 1 });
  assert.deepEqual(decodeAwsJson({ finishedAt: 1 }, "payload"), { finishedAt: 1 });
  assert.equal(decodeAwsJson(null, "payload"), null);
  assert.equal(decodeAwsJson(undefined, "payload"), undefined);
});

test("invalid AWSJSON names the field and keeps the parser error as cause", () => {
  assert.throws(
    () => decodeAwsJson("{not json", "Remote training state payload"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Remote training state payload is not valid AWSJSON");
      assert.ok(error.cause instanceof SyntaxError);
      return true;
    },
  );
});

test("a JSON string value has to arrive quoted", () => {
  assert.equal(decodeAwsJson('"text"', "label"), "text");
  assert.throws(() => decodeAwsJson("text", "label"), { message: "label is not valid AWSJSON" });
});
