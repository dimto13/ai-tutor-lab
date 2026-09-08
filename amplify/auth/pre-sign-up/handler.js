import { BETA_ACCESS_DENIED_MARKER, isBetaAllowed } from "../beta-access.js";

export const handler = async (event) => {
  const email = event.request?.userAttributes?.email;
  if (!isBetaAllowed(email, process.env.BETA_ALLOWED_EMAILS)) {
    // Deny before Cognito creates or links the identity. Do not log the email or allowlist.
    console.warn("closed beta signup denied", {
      userPoolId: event.userPoolId,
      triggerSource: event.triggerSource,
    });
    throw new Error(BETA_ACCESS_DENIED_MARKER);
  }

  return event;
};
