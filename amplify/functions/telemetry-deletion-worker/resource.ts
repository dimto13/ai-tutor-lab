import { defineFunction } from "@aws-amplify/backend";

export const telemetryDeletionWorker = defineFunction({
  name: "telemetry-deletion-worker",
  resourceGroupName: "data",
  entry: "./handler.js",
  timeoutSeconds: 300,
});
