import { defineFunction, secret } from "@aws-amplify/backend";

export const tutorRelay = defineFunction({
  name: "tutor-relay",
  entry: "./handler.js",
  // Amplify Hosting ends SSR requests after 30 s; the handler gives up after its own deadline.
  timeoutSeconds: 28,
  environment: {
    TUTOR_RELAY_KEY: secret("TUTOR_RELAY_KEY"),
    // Closed-beta policy (#486): prompts stay on the RMI-PC. Cloud-primary remains a later
    // configuration change; no application or provider contract needs to change for that rollback.
    TUTOR_RELAY_PRIMARY_MODEL: "gemma4:e4b@local",
    TUTOR_RELAY_FALLBACK_MODEL: "",
  },
});
