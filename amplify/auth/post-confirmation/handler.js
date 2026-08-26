const cognitoIdentityProviderModule = "@aws-sdk/client-cognito-identity-provider";

export const handler = async (event) => {
  // Nur die Erstbestaetigung einer Self-Service-Registrierung provisioniert den Bootstrap-Tenant.
  // Cognito ruft denselben Trigger auch nach bestaetigtem Passwort-Reset auf; dort ist die
  // Mitgliedschaft bereits entschieden und ein erneuter Gruppenaufruf waere wirkungslos.
  if (event.triggerSource !== "PostConfirmation_ConfirmSignUp") return event;

  // Lambda's managed Node.js runtime includes AWS SDK v3. Keep this import
  // runtime-resolved so Amplify can synthesize the function without requiring
  // an undeclared root package dependency.
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
    // Der Bestaetigungsschritt selbst wird nicht abgebrochen: der Nutzer ist in Cognito bereits
    // bestaetigt, ein geworfener Trigger erzeugt nur einen undurchsichtigen Client-Fehler.
    // Fail-closed bleibt erhalten, weil ohne Tenant-Gruppe jeder Eigendatenpfad serverseitig
    // gesperrt bleibt und die UI den gemappten fachlichen Zustand zeigt. Fuer die Nachverfolgung
    // wird ausschliesslich das pseudonyme Subject protokolliert, keine Mailadresse.
    console.error("tenant bootstrap provisioning failed", {
      userPoolId: event.userPoolId,
      subject: event.request?.userAttributes?.sub ?? null,
      group: process.env.BOOTSTRAP_TENANT_GROUP,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  return event;
};
