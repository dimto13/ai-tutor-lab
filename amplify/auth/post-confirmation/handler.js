const cognitoIdentityProviderModule = "@aws-sdk/client-cognito-identity-provider";

export const handler = async (event) => {
  // Lambda's managed Node.js runtime includes AWS SDK v3. Keep this import
  // runtime-resolved so Amplify can synthesize the function without requiring
  // an undeclared root package dependency.
  const {
    AdminAddUserToGroupCommand,
    CognitoIdentityProviderClient,
  } = await import(cognitoIdentityProviderModule);
  const client = new CognitoIdentityProviderClient({});

  await client.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: event.userPoolId,
      Username: event.userName,
      GroupName: process.env.BOOTSTRAP_TENANT_GROUP,
    }),
  );
  return event;
};
