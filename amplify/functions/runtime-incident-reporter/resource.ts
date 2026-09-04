import { defineFunction, secret } from "@aws-amplify/backend";

export const runtimeIncidentReporter = defineFunction({
  name: "runtime-incident-reporter",
  resourceGroupName: "data",
  entry: "./handler.js",
  timeoutSeconds: 30,
  environment: {
    RUNTIME_INCIDENT_GITHUB_TOKEN: secret("RUNTIME_INCIDENT_GITHUB_TOKEN"),
  },
});
