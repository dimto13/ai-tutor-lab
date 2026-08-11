# Cloud-Provider-Boundary

## Ziel

Die Anwendung bleibt auf der fachlichen und UI-seitigen Ebene cloud-neutral. AWS ist fuer den
aktuellen MVP die erste konkrete Infrastruktur, darf aber nicht zum Vertrag der Anwendung werden.
Ein spaeterer Wechsel oder Parallelbetrieb mit einer anderen Cloud soll durch neue Adapter
moeglich sein, ohne Komponenten, Trainingslogik oder fachliche Modelle umzubauen.

## Verbindliche Abhaengigkeitsrichtung

```text
UI / Routes / State / Application Logic
                |
                v
          AuthService
          UserIdentity
          AuthSession
                |
                v
       Cloud-spezifischer Adapter
                |
                v
       AWS Amplify / Cognito heute
       weitere Provider spaeter
```

Die Anwendung importiert keine Cloud-SDKs direkt. Cloud-spezifische Auth-SDK-Imports sind im Web
nur unter `apps/web/src/auth/adapters/` erlaubt. `tests/architecture/cloudBoundary.test.ts`
sichert diese Grenze in CI ab.

## Auth-Vertrag

`apps/web/src/auth/authService.ts` definiert die kanonische Identitaet und den Auth-Vertrag.
Provider-spezifische Benutzerobjekte, Tokenklassen oder Claims werden nicht durch die Anwendung
gereicht. Ein Adapter normalisiert sie mindestens auf:

- `userId`
- `tenantId`
- `email`
- `displayName`
- `roles`

`tenantId` bleibt Teil der kanonischen Identitaet, damit Persistenz- und
Autorisierungsentscheidungen nicht an Cognito-spezifische Datenstrukturen gekoppelt werden.

Der Trainingsfortschritt speichert davon nur die fachlich notwendige Referenz
`TrainingSubjectRef { userId, tenantId }`. Browser-Fortschritt und Runtime-Snapshots werden pro
Mandant/Nutzer getrennt. Die Training Engine importiert weder Auth-Code noch Cloud-SDKs.

## Aktueller Provider: AWS

#44 implementiert AWS Amplify Gen 2 / Amazon Cognito als erste Infrastrukturimplementierung.
`apps/web/src/auth/adapters/cognitoAuthService.ts` implementiert `AuthService`; Komponenten,
Routes und State verwenden ausschliesslich den cloud-neutralen Vertrag. Das Laden von
`amplify_outputs.json` und alle Amplify-SDK-Aufrufe enden im AWS-Adapter.

Die Mandantenzuordnung ist bewusst kein selbst aenderbares Cognito-Profilattribut. Der
Cognito-Adapter liefert `tenantId` deshalb derzeit als `null`. Die serverautoritativ verwaltete
Zuordnung von `userId` zu `tenantId` wird mit der Persistenz-/Membership-Schicht aus #45
eingefuehrt und danach ueber den bestehenden cloud-neutralen `UserIdentity`-Vertrag bereitgestellt.

Die Backend-Ressourcen unter `amplify/` duerfen AWS-spezifisch sein. Cloud-Neutralitaet bedeutet
nicht, Cloud-Ressourcen kuenstlich auf einen kleinsten gemeinsamen Nenner zu reduzieren. Neutral
bleiben die fachlichen Ports und die Richtung der Abhaengigkeiten.

### Auswahl des Auth-Adapters

Die Composition Root `apps/web/src/auth/applicationAuthService.ts` kennt zwei Modi:

- `cognito`: produktiver AWS-Adapter.
- `local`: deterministischer lokaler Adapter fuer Entwicklung und E2E-Tests.

`VITE_AUTH_MODE` kann den Modus explizit auf `local` oder `cognito` setzen. Ohne Angabe gilt:
Production-Build -> `cognito`, Development -> `local`.

Der lokale Adapter kann optional ueber folgende Build-Variablen angepasst werden:

- `VITE_LOCAL_AUTH_USER_ID`
- `VITE_LOCAL_AUTH_TENANT_ID`
- `VITE_LOCAL_AUTH_EMAIL`
- `VITE_LOCAL_AUTH_DISPLAY_NAME`

Diese Werte sind reine Entwicklungsidentitaeten und keine Secrets.

## OIDC

Externe OIDC-Provider sind optionale Infrastrukturkonfiguration. Ohne OIDC-Konfiguration bleibt
Cognito bei E-Mail/Passwort. Sobald OIDC aktiviert wird, muessen diese Backend-Variablen gemeinsam
gesetzt sein:

- `AUTH_OIDC_PROVIDER_NAME`
- `AUTH_OIDC_ISSUER_URL`
- `AUTH_OIDC_CALLBACK_URLS` — kommaseparierte Callback-URLs
- `AUTH_OIDC_LOGOUT_URLS` — kommaseparierte Logout-URLs

Client-Zugangsdaten werden nicht als normale Environment-Variablen oder im Repository gespeichert,
sondern als Amplify-Secrets mit den festen generischen Namen:

- `AUTH_OIDC_CLIENT_ID`
- `AUTH_OIDC_CLIENT_SECRET`

Im Web wird nur die fachliche Provider-ID benoetigt:

- `VITE_AUTH_OIDC_PROVIDER_ID`

Sie muss dem fuer Cognito konfigurierten `AUTH_OIDC_PROVIDER_NAME` entsprechen. Die UI zeigt nur
dann die Unternehmens-SSO-Aktion. Issuer, Client-ID, Secret und Cognito-spezifische Metadaten
werden niemals in UI-Komponenten gereicht.

Auf einer OIDC-Callback-Seite registriert der AWS-Adapter den Amplify-Auth-Hub-Listener, bevor der
OAuth-Listener aktiviert wird. Erst nach `signInWithRedirect` wird die Session gelesen; ein
`signInWithRedirect_failure` oder ein ausbleibender Callback fuehrt zu einem expliziten Fehler.
Damit kann die Anwendung nicht vor Abschluss des Authorization-Code-Austauschs faelschlich in den
anonymen Zustand wechseln.

Damit kann spaeter beispielsweise ein anderer Unternehmens-IdP durch Deployment-Konfiguration
ersetzt werden, ohne `AuthService` oder die UI umzubauen. Ein Google-Cloud-/Identity-Platform-
Adapter ist bewusst noch nicht implementiert.

## Amplify Outputs und Releasepfad

Der Gen-2-Backend-Build laeuft im bestehenden `deploy`-Releasepfad mit `ampx pipeline-deploy`.
Die generierte Client-Konfiguration wird nach `apps/web/public/amplify_outputs.json` geschrieben
und nicht in Git eingecheckt. Erst danach baut das Frontend das bestehende SSR-Compute-Artefakt.

`deploy` bleibt ausschliesslich Release-Zeiger. Ein KI-Agent verschiebt diesen Ref nicht; die
Freigabe `git push origin main:deploy` bleibt eine bewusste Aktion des Repository-Eigentuemers.

## Hosting

Auch das Hosting bleibt eine Infrastrukturentscheidung. Der aktuelle Produktionspfad ist
TanStack Start -> Nitro -> AWS Amplify Hosting Compute. Ein spaeteres anderes Hostingziel darf
einen eigenen Build-/Deployment-Adapter erhalten; die UI- und Trainingspakete bleiben davon
unabhaengig.

## Anti-Patterns

Nicht erlaubt:

```text
Component -> aws-amplify/auth
Route -> CognitoUser
TrainingStore -> Amplify Data Client
TrainingSession -> CognitoUser
AuthService -> FirebaseUser | CognitoUser
```

Erlaubt:

```text
Component -> AuthService
TrainingSession -> TrainingSubjectRef
AuthService <- CognitoAdapter
AuthService <- LocalAdapter
AuthService <- weiterer Adapter spaeter
```

## Umsetzung in #44

1. Cloud-neutralen `AuthService` und `UserIdentity` etablieren.
2. Architekturgrenze in CI absichern.
3. Amplify Gen-2-/Cognito-Backend auf dem aktuellen `main` wieder einfuehren.
4. Cognito-Adapter hinter `AuthService` implementieren.
5. Web-UI ausschliesslich gegen `AuthService` verdrahten.
6. OIDC konfigurierbar ergaenzen, ohne die UI an einen konkreten Identity Provider zu koppeln.
7. `TrainingSubjectRef` in der Training Session verankern und Persistenz pro Nutzer/Mandant trennen.
8. Reale AWS-Abnahme erst nach gruenem PR/Merge und manueller Freigabe `main:deploy` durch den Repository-Eigentuemer.
