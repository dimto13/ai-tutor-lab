import type { AuthService, UserIdentity } from "./authService";
import { createLocalAuthService } from "./localAuthService";

export type ApplicationAuthMode = "local" | "cognito";

function configuredMode(): ApplicationAuthMode {
  const configured = import.meta.env["VITE_AUTH_MODE"]?.trim().toLowerCase();
  if (!configured) return import.meta.env.PROD ? "cognito" : "local";
  if (configured === "local" || configured === "cognito") return configured;
  throw new Error(`Unsupported VITE_AUTH_MODE: ${configured}`);
}

function localIdentity(): UserIdentity {
  return {
    userId: import.meta.env["VITE_LOCAL_AUTH_USER_ID"]?.trim() || "local-learner",
    tenantId: import.meta.env["VITE_LOCAL_AUTH_TENANT_ID"]?.trim() || "local-tenant",
    email: import.meta.env["VITE_LOCAL_AUTH_EMAIL"]?.trim() || "learner@local.test",
    displayName: import.meta.env["VITE_LOCAL_AUTH_DISPLAY_NAME"]?.trim() || "Lokaler Lernender",
    roles: ["learner"],
  };
}

function createLazyCognitoAuthService(outputsUrl: string): AuthService {
  let servicePromise: Promise<AuthService> | null = null;

  function getService(): Promise<AuthService> {
    servicePromise ??= import("./adapters/cognitoAuthService").then(
      ({ createDefaultCognitoAuthService }) => createDefaultCognitoAuthService({ outputsUrl }),
    );
    return servicePromise;
  }

  return {
    async getSession() {
      return (await getService()).getSession();
    },
    async refreshSession() {
      return (await getService()).refreshSession();
    },
    async signIn(request) {
      return (await getService()).signIn(request);
    },
    async signOut() {
      await (await getService()).signOut();
    },
  };
}

/**
 * Composition root for authentication. This is intentionally the only
 * provider-selection point above the concrete adapter directory.
 */
export function createApplicationAuthService(): AuthService {
  if (configuredMode() === "local") {
    return createLocalAuthService({
      identity: localIdentity(),
      initiallyAuthenticated: true,
    });
  }

  return createLazyCognitoAuthService(
    import.meta.env["VITE_AMPLIFY_OUTPUTS_URL"]?.trim() || "/amplify_outputs.json",
  );
}
