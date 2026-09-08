import { defineFunction } from "@aws-amplify/backend";

export const tenantPostConfirmation = defineFunction({
  name: "tenant-post-confirmation",
  resourceGroupName: "auth",
  entry: "./handler.js",
  environment: {
    BOOTSTRAP_TENANT_GROUP: "tenant:default",
    // Closed-beta owner process: maintain the comma-separated normalized tester emails in the
    // deployment environment. Empty/missing configuration intentionally admits nobody new.
    BETA_ALLOWED_EMAILS: process.env["BETA_ALLOWED_EMAILS"] ?? "",
  },
});
