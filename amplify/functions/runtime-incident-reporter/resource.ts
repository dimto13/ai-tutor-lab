import { defineFunction } from "@aws-amplify/backend";

export const runtimeIncidentReporter = defineFunction({
  name: "runtime-incident-reporter",
  resourceGroupName: "data",
  entry: "./handler.js",
  timeoutSeconds: 30,
});
