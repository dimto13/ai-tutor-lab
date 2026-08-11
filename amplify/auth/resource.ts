import { defineAuth } from "@aws-amplify/backend";

/**
 * AWS implementation of the platform authentication capability.
 *
 * Application code must not import this resource directly. The web application
 * consumes the cloud-neutral AuthService contract and reaches Cognito only via
 * the dedicated AWS auth adapter.
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  accountRecovery: "EMAIL_ONLY",
  userAttributes: {
    fullname: {
      required: false,
      mutable: true,
    },
    "custom:tenant_id": {
      dataType: "String",
      mutable: true,
      minLen: 1,
      maxLen: 128,
    },
  },
});
