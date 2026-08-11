import { defineAuth } from "@aws-amplify/backend";

/**
 * Cognito User Pool mit Selbstregistrierung per E-Mail.
 *
 * Bewusst ohne MFA: Fuer den Pilotstart ist der zusaetzliche Schritt zu viel Reibung.
 * Nachruestbar ueber `multifactor`, ohne den Pool neu anlegen zu muessen.
 *
 * Die OIDC-Foederation zum Firmen-IdP ist AITP-83 und kommt hier als
 * `loginWith.externalProviders.oidc` dazu -- konfigurierbar ueber Umgebungsvariablen
 * und `secret()`, damit der Provider ohne Codeaenderung austauschbar bleibt.
 *
 * @see docs/19-aws-amplify-konventionen.md
 * @see https://docs.amplify.aws/react/build-a-backend/auth/
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },

  // Explizit gesetzt statt implizit: Ohne Angabe leitet Amplify die Wiederherstellung
  // aus den Login-Methoden ab. Was fuer Nutzerkonten gilt, soll im Code stehen und
  // nicht aus einem Default folgen.
  accountRecovery: "EMAIL_ONLY",

  // Anzeigename fuer die Oberflaeche. Optional und aenderbar, damit die Registrierung
  // schlank bleibt und AITP-83 selbst entscheiden kann, ob es den Namen abfragt.
  userAttributes: {
    fullname: { required: false, mutable: true },
  },
});
