# AWS-Amplify-Konventionen

## Ziel

Verbindliche Regeln fuer AWS-Amplify-Arbeit in diesem Repository. Sie konsolidieren die
Erfahrungen aus dem bereits real angebundenen `deploy`-Branch und verhindern, dass die dort
geloesten Build-, Pfad- und Sicherheitsprobleme beim Uebertragen auf `main` erneut entstehen.

## 1. Branch- und Release-Modell

`main` ist die einzige Entwicklungs- und Integrationsbasis. AWS Amplify deployt dagegen den
Branch `deploy`.

```text
Feature-Branch (Basis: main)
  -> Pull Request nach main
  -> validate + e2e-training-modes gruen
  -> Merge nach main
  -> manuelle Freigabe durch den Repository-Eigentuemer
     git push origin main:deploy
  -> AWS Amplify Deployment
```

`deploy` ist ein Release-Zeiger, kein Entwicklungsbranch. Nach der einmaligen Konsolidierung
werden dort keine eigenen Aenderungen entwickelt. KI-Agenten duerfen den Ref `deploy` nicht
verschieben und insbesondere keinen Push `main:deploy` ausloesen. Die Freigabe bleibt eine
bewusste Nutzeraktion.

### Einmalige Historien-Konsolidierung

Vor #43 waren `main` und `deploy` bereits divergiert: `deploy` enthielt wertvolle Amplify-
Erfahrungen, aber auch Gen-2/Auth-Vorarbeit, die fachlich noch nicht nach `main` gehoert. Ein
normaler Push `main:deploy` waere deshalb beim ersten Release kein Fast-Forward.

Die einmalige Konsolidierung loest das ohne Force-Push und ohne blindes Uebernehmen der alten
`deploy`-Dateien: Der Integrationsbranch fuer #43 wird von `main` aufgebaut und erhaelt am Ende
einen Merge-Commit mit dem bisherigen `deploy`-Tip als zweitem Parent, waehrend sein Tree exakt
den auditierten #43-Zielstand behaelt. Der PR muss deshalb mit **Merge Commit** nach `main`
integriert werden; Squash oder Rebase wuerden diese Abstammung wieder entfernen.

Danach ist der bisherige `deploy`-Tip ein Vorfahr von `main`. Der vom Repository-Eigentuemer
ausgefuehrte Befehl

```bash
git push origin main:deploy
```

ist dann ein normaler Fast-Forward und setzt `deploy` auf den freigegebenen `main`-Stand. Fuer
alle spaeteren Deployments ist keine Sonderbehandlung mehr erforderlich.

## 2. Hosting-Modus

Die Web-App ist TanStack Start mit SSR ueber Nitro. Hosting erfolgt deshalb als Amplify
Hosting Compute (`WEB_COMPUTE`), nicht als statisches Hosting. `apps/web/vite.config.ts`
verwendet beim Production-Build Nitro mit dem Preset `aws_amplify` und Runtime
`nodejs22.x`.

Der Build muss `apps/web/.amplify-hosting/` mit mindestens diesen Artefakten erzeugen:

- `deploy-manifest.json`
- `compute/default/server.js`
- `static/`

`scripts/validate-amplify-output.mjs` ist der Repo-seitige Guard fuer Manifest, Catch-all-Route,
Compute-Resource und Runtime.

## 3. Monorepo-Build

Amplify verwendet `appRoot: apps/web`, aber die npm-Workspaces werden vom Repo-Root gebaut.
Deshalb steht `buildPath: /` unter `frontend:`.

Wichtig aus den realen Build-Versuchen auf `deploy`:

- `buildPath` gehoert unter `frontend`; eine Backend-Phase kennt diesen Schluessel nicht.
- Amplify-Phasen koennen dieselbe Shell/CWD weiterverwenden. Keine blinden mehrfachen `cd ../..`.
- Node.js 22 wird vor dem Build explizit installiert und aktiviert.
- Die Installationsstrategie bleibt mit GitHub CI konsistent:
  `npm ci --install-strategy=nested`.
- Fuer schnellere Builds wird nur der npm-Download-Cache `.npm` verwendet. `node_modules` wird
  nicht gecacht, weil `npm ci` ihn ohnehin neu erzeugt.

Die Umgebungsvariable `AMPLIFY_MONOREPO_APP_ROOT` muss in Amplify auf `apps/web` stehen.

## 4. Generierte Artefakte bleiben ausserhalb von Git

Nicht einchecken:

- `.amplify/`
- `apps/web/.amplify-hosting/`
- `amplify_outputs*`
- `amplifyconfiguration*`
- `.npm/`

Die Regeln stehen sowohl in `.gitignore` als auch fuer relevante Build-Verzeichnisse in der
ESLint-Konfiguration.

## 5. Gen-2-Backend kommt kontrolliert in #44/#45

Der historische `deploy`-Branch enthaelt bereits Vorarbeit fuer Amplify Gen 2/Auth. Diese wird
nicht blind nach `main` kopiert. #43 uebernimmt nur den bewiesenen Hosting-/Build-Unterbau.
Cognito/Auth wird in #44 und Persistenz in #45 auf Basis des dann aktuellen `main` integriert.

Dabei gelten fuer alle spaeteren Ressourcen folgende Regeln.

### Generierte Ressourcen nie ueber konkrete ARN/ID verdrahten

Rollen, Buckets, Tabellen und User-Pools werden ueber die von Amplify/CDK erzeugten Ressourcen
referenziert. Hartcodierte ARNs oder IDs brechen bei Neuaufbau, Sandbox und Branch-Deployment.

### Zugriff pro Identitaet statt global fuer alle Angemeldeten

`allow.authenticated` bedeutet "jeder angemeldete Nutzer". Fuer nutzereigene Daten wird der
Zugriff an Identitaet/Eigentuemer gebunden; fuer mandantenfaehige Daten kommt `tenantId`
zusaetzlich in Modell und Autorisierung.

### Keine Gast-Identitaeten fuer die produktive Umgebung

Eine unauthentifizierte Identity-Pool-Rolle darf die geschuetzte Trainingsumgebung nicht
ungewollt oeffnen.

### Fremdsystem-Geheimnisse nicht ins Datenmodell

API-Keys, Passwoerter und Tokens fremder Systeme gehoeren in AWS Secrets Manager bzw. in
Amplify-`secret()` fuer Deploy-Time-Secrets. Der Browser bekommt solche Werte nie zurueck.

### Lambda-Assets explizit schneiden

`Code.fromAsset(...)` packt vom Dateisystem, nicht aus Git. Testordner, Caches und lokale
Artefakte muessen deshalb explizit ausgeschlossen werden.

## 6. AWS-Abnahme fuer #43

Repo-seitig gruene CI beweist nur, dass das Compute-Bundle reproduzierbar gebaut wird. #43 ist
erst abgeschlossen, wenn nach dem Merge nach `main` der Repository-Eigentuemer bewusst

```bash
git push origin main:deploy
```

ausgefuehrt hat und der reale Amplify-Job erfolgreich ist. Danach werden mindestens diese Punkte
geprueft:

1. Branch `deploy` ist der angeschlossene Deployment-Branch.
2. `AMPLIFY_MONOREPO_APP_ROOT=apps/web`.
3. Hosting laeuft als `WEB_COMPUTE` mit Node.js 22.
4. Startseite und Trainingsroute liefern SSR-Antworten.
5. Die definierte 500-Fehlerseite aus `src/server.ts` funktioniert in der Compute-Umgebung.
6. CloudWatch-/SSR-Logs stehen fuer Fehlerdiagnose zur Verfuegung.

PR-Preview-Deployments sind bewusst nicht Bestandteil dieses Flows, um unnoetige AWS-Deployments
zu vermeiden.
