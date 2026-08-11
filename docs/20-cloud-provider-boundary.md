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

`tenantId` bleibt Teil der kanonischen Identitaet, damit spaetere Persistenz- und
Autorisierungsentscheidungen nicht an Cognito-spezifische Datenstrukturen gekoppelt werden.

## Aktueller Provider: AWS

#44 implementiert zunaechst AWS Amplify Gen 2 / Amazon Cognito. Der spaetere Cognito-Adapter
implementiert `AuthService`; Komponenten und Routes verwenden ausschliesslich diesen Vertrag.
Die Amplify-Konfiguration und das Laden von `amplify_outputs.json` gehoeren ebenfalls hinter die
Adapter-/Composition-Root-Grenze und nicht in einzelne UI-Komponenten.

Die Backend-Ressourcen unter `amplify/` duerfen AWS-spezifisch sein. Cloud-Neutralitaet bedeutet
nicht, Cloud-Ressourcen kuenstlich auf einen kleinsten gemeinsamen Nenner zu reduzieren. Neutral
bleiben die fachlichen Ports und die Richtung der Abhaengigkeiten.

## Lokaler Adapter

`createLocalAuthService()` ist die deterministische Implementierung fuer lokale Entwicklung und
Tests. Sie verwendet exakt denselben `AuthService`-Vertrag wie der spaetere Cognito-Adapter und
verhindert, dass lokale Tests eine echte Cloud-Session benoetigen.

## OIDC

Externe OIDC-Provider werden spaeter als Konfiguration des AWS-Adapters/Backends angebunden. Die
Anwendung kennt dabei nur eine fachliche `providerId`; Issuer-URL, Client-ID, Secret und
Cognito-spezifische Einstellungen bleiben Infrastrukturkonfiguration. Es wird jetzt noch kein
Google-Cloud- oder Google-Identity-Adapter implementiert.

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
AuthService -> FirebaseUser | CognitoUser
```

Erlaubt:

```text
Component -> AuthService
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
6. OIDC danach konfigurierbar ergaenzen, ohne die UI an einen konkreten Identity Provider zu koppeln.
7. Reale AWS-Abnahme erst nach gruenem PR/Merge und manueller Freigabe `main:deploy` durch den Repository-Eigentuemer.
