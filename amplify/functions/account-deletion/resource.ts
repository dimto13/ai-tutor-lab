import { defineFunction } from "@aws-amplify/backend";

export const accountDeletion = defineFunction({
  name: "account-deletion",
  resourceGroupName: "data",
  entry: "./handler.js",
  timeoutSeconds: 300,
});
