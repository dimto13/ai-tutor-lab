import { defineFunction } from "@aws-amplify/backend";

export const userDataExport = defineFunction({
  name: "user-data-export",
  resourceGroupName: "data",
  entry: "./handler.js",
  timeoutSeconds: 300,
});
