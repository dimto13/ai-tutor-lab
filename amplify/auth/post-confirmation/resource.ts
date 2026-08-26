import { defineFunction } from "@aws-amplify/backend";

export const tenantPostConfirmation = defineFunction({
  name: "tenant-post-confirmation",
  resourceGroupName: "auth",
  entry: "./handler.js",
  environment: {
    BOOTSTRAP_TENANT_GROUP: "tenant:default",
  },
});
