import { defineFunction } from "@aws-amplify/backend";

export const betaPreSignUp = defineFunction({
  name: "beta-pre-sign-up",
  resourceGroupName: "auth",
  entry: "./handler.js",
  environment: {
    // Closed-beta owner process. Empty/missing configuration intentionally admits nobody new.
    BETA_ALLOWED_EMAILS: process.env["BETA_ALLOWED_EMAILS"] ?? "",
  },
});
