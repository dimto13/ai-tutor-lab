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

test("invalid AWSJSON names the field instead of becoming an empty value", () => {
  assert.throws(() => decodeAwsJson("{not json", "Remote training state payload"), {
    message: "Remote training state payload is not valid AWSJSON",
  });
});
