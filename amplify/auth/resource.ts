import { defineAuth } from "@aws-amplify/backend";

/**
 * Cognito User Pool mit Selbstregistrierung per E-Mail.
 *
 * Bewusst minimal gehalten: Die OIDC-Foederation zum Firmen-IdP ist AITP-83 und
 * wird hier als `loginWith.externalProviders.oidc` ergaenzt -- konfigurierbar ueber
 * Umgebungsvariablen und `secret()`, damit der Provider ohne Codeaenderung
 * austauschbar bleibt (Akzeptanzkriterium von AITP-83).
 *
 * @see https://docs.amplify.aws/react/build-a-backend/auth/
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
});
