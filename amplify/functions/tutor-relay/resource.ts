import { defineFunction, secret } from "@aws-amplify/backend";

export const tutorRelay = defineFunction({
  name: "tutor-relay",
  entry: "./handler.js",
  // Amplify Hosting ends SSR requests after 30 s; the handler gives up after its own deadline.
  timeoutSeconds: 28,
  environment: {
    TUTOR_RELAY_KEY: secret("TUTOR_RELAY_KEY"),
  },
});
