import { isBetaAllowed } from "./beta-access.js";

const cognitoIdentityProviderModule = "@aws-sdk/client-cognito-identity-provider";

export const handler = async (event) => {
  // Only the first confirmation of a self-service registration may provision the bootstrap tenant.
  // Existing confirmed accounts keep their current group membership; password-reset confirmations
  // therefore remain migration-safe and do not re-evaluate beta eligibility.
  if (event.triggerSource !== "PostConfirmation_ConfirmSignUp") return event;

  const email = event.request?.userAttributes?.email;
  if (!isBetaAllowed(email, process.env.BETA_ALLOWED_EMAILS)) {
    // Cognito has already confirmed the identity at this point. Fail closed by withholding the
    // tenant group: all server-authoritative tenant data paths remain unavailable. Never log the
    // email address or the allowlist itself.
    console.warn("beta access withheld for confirmed identity", {
      userPoolId: event.userPoolId,
      subject: event.request?.userAttributes?.sub ?? null,
    });
    return event;
  }

  // Lambda's managed Node.js runtime includes AWS SDK v3. Keep this import runtime-resolved so
  // Amplify can synthesize the function without requiring an undeclared root package dependency.
  const { AdminAddUserToGroupCommand, CognitoIdentityProviderClient } = await import(
    cognitoIdentityProviderModule
  );
  const client = new CognitoIdentityProviderClient({});

  try {
    await client.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: event.userPoolId,
        Username: event.userName,
        GroupName: process.env.BOOTSTRAP_TENANT_GROUP,
      }),
    );
  } catch (error) {
    // Do not turn an already-completed Cognito confirmation into an opaque client failure.
    // Without the tenant group every tenant data path still fails closed.
    console.error("tenant bootstrap provisioning failed", {
      userPoolId: event.userPoolId,
      subject: event.request?.userAttributes?.sub ?? null,
      group: process.env.BOOTSTRAP_TENANT_GROUP,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  return event;
};
