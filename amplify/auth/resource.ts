import { defineAuth, secret } from "@aws-amplify/backend";
import { tenantPostConfirmation } from "./post-confirmation/resource";

interface OidcConfiguration {
  providerName: string;
  issuerUrl: string;
  callbackUrls: string[];
  logoutUrls: string[];
}

function parseUrls(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function readOidcConfiguration(): OidcConfiguration | null {
  const providerName = process.env["AUTH_OIDC_PROVIDER_NAME"]?.trim() ?? "";
  const issuerUrl = process.env["AUTH_OIDC_ISSUER_URL"]?.trim() ?? "";
  const callbackUrls = parseUrls(process.env["AUTH_OIDC_CALLBACK_URLS"]);
  const logoutUrls = parseUrls(process.env["AUTH_OIDC_LOGOUT_URLS"]);
  const oidcConfigured =
    providerName.length > 0 ||
    issuerUrl.length > 0 ||
    callbackUrls.length > 0 ||
    logoutUrls.length > 0;

  if (!oidcConfigured) return null;

  if (!providerName || !issuerUrl || callbackUrls.length === 0 || logoutUrls.length === 0) {
    throw new Error(
      "OIDC configuration is incomplete. Set AUTH_OIDC_PROVIDER_NAME, AUTH_OIDC_ISSUER_URL, AUTH_OIDC_CALLBACK_URLS and AUTH_OIDC_LOGOUT_URLS together.",
    );
  }

  return { providerName, issuerUrl, callbackUrls, logoutUrls };
}

const oidc = readOidcConfiguration();

/**
 * AWS implementation of the platform authentication capability.
 *
 * Application code must not import this resource directly. The web application
 * consumes the cloud-neutral AuthService contract and reaches Cognito only via
 * the dedicated AWS auth adapter.
 *
 * Tenant membership is server-managed through `tenant:<tenantId>` Cognito
 * groups. `tenant:default` is the bootstrap tenant for self-service email
 * registrations and is assigned only by the backend post-confirmation trigger.
 * Application roles use the separate finite `role:<roleId>` group namespace and
 * are normalized to cloud-neutral role IDs at the auth boundary.
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
    ...(oidc
      ? {
          externalProviders: {
            oidc: [
              {
                name: oidc.providerName,
                issuerUrl: oidc.issuerUrl,
                clientId: secret("AUTH_OIDC_CLIENT_ID"),
                clientSecret: secret("AUTH_OIDC_CLIENT_SECRET"),
              },
            ],
            callbackUrls: oidc.callbackUrls,
            logoutUrls: oidc.logoutUrls,
          },
        }
      : {}),
  },
  groups: ["tenant:default", "role:learner", "role:author", "role:trainer", "role:tenant_admin"],
  triggers: {
    postConfirmation: tenantPostConfirmation,
  },
  access: (allow) => [allow.resource(tenantPostConfirmation).to(["addUserToGroup"])],
  accountRecovery: "EMAIL_ONLY",
  userAttributes: {
    fullname: {
      required: false,
      mutable: true,
    },
  },
});
