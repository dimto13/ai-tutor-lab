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

### Das Compute-Artefakt muss wirklich gestartet werden

Ein erfolgreicher Build und ein gueltiges `deploy-manifest.json` reichen nicht als Nachweis fuer
einen funktionsfaehigen SSR-Deploy. Bei der ersten realen #43-Abnahme wurde ein formal gueltiges
Bundle erfolgreich von Amplify deployed, lieferte aber auf jeder SSR-Route HTTP 500. Ursache war
ein beim Bundling erzeugter Cross-Chunk-Helper (`__exportAll`), dessen importierte Bindung beim
Laden des SSR-Moduls nicht aufrufbar war.

Darum startet Code CI nach jedem Production-Build exakt
`apps/web/.amplify-hosting/compute/default/server.js` unter Node.js 22 und prueft per HTTP:

- `/` -> `200 text/html`
- `/training/vscode-basics.guided` -> `200 text/html`

Der Guard ist `npm run validate:amplify-runtime`. Ein Build darf nicht als deployment-ready
gelten, wenn dieser Test fehlschlaegt.

### SSR-Chunking fuer das aktuelle Nitro-Bundle

Die aktuell verwendete Nitro-/Rolldown-Kombination erzeugte bei aktiviertem Server-Code-Splitting
den oben beschriebenen defekten Cross-Chunk-Helper. Deshalb setzt die Production-Konfiguration
vorerst `inlineDynamicImports: true`. Dadurch bleibt der Nitro-Servergraph in einem Bundle und
der fehlerhafte Cross-Chunk-Pfad wird vermieden.

Diese Option ist kein beliebig entfernbares Performance-Tuning, sondern ein durch den echten
Compute-Runtime-Smoke abgesicherter Kompatibilitaets-Workaround fuer #225. Bei einem spaeteren
Nitro-/Vite-/Rolldown-Upgrade darf sie erst entfernt werden, wenn der unveraenderte Runtime-Smoke
mit wieder aktiviertem Code-Splitting gruen bleibt.

## 3. Monorepo-Build

Amplify verwendet `appRoot: apps/web`, aber die npm-Workspaces werden vom Repo-Root gebaut.
Deshalb steht `buildPath: /` unter `frontend:`.

Wichtig aus den realen Build-Versuchen auf `deploy` und der #44-CI:

- `buildPath` gehoert unter `frontend`; eine Backend-Phase kennt diesen Schluessel nicht.
- Amplify-Phasen koennen dieselbe Shell/CWD weiterverwenden. Keine blinden mehrfachen `cd ../..`.
- Node.js 22 wird vor dem Build explizit installiert und aktiviert.
- Die Installationsstrategie bleibt mit GitHub CI konsistent: normales `npm ci` gegen den
  eingecheckten Lockfile. Die erzwungene Strategie `--install-strategy=nested` darf mit dem
  Amplify/CDK-Dependency-Graph nicht verwendet werden, weil sie mit gebuendelten Abhaengigkeiten
  kollidiert.
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

## 7. Deployment-Ueberwachung per AWS CLI

Der Zustand eines Deployments ist ausschliesslich in AWS sichtbar. Ein gruener GitHub-Workflow
sagt darueber nichts aus: Amplify baut den Branch `deploy`, GitHub Actions baut `main`.

### Ein Aufruf fuer den Gesamtzustand

```bash
npm run amplify:status
```

`scripts/amplify-deployment-status.sh` zeigt den initialen Zustand und fuegt bei einem aktiven Deployment statusaktualisierte Zeilen mit Zeitstempel an (standardmaessig alle 30 Sekunden), bis das Deployment beendet ist. Nach Abschluss gibt das Skript eine Zusammenfassung aus und beendet sich automatisch (oder vorab per Strg+C). Fuer eine rein einmalige Ausgabe ohne Verfolgung kann `npm run amplify:status:once` oder `npm run amplify:status -- --once` verwendet werden.

Das Skript beantwortet den aktuellen Zustand: ob gerade ein Job laeuft, wie das letzte abgeschlossene Deployment ausgegangen ist und wie die juengste Historie aussieht.
Bei einer fehlgeschlagenen Phase gibt es den Befehl aus, der das zugehoerige Build-Log abruft.
Das Skript laeuft unter POSIX `sh`; fuer portable Zeitverarbeitung nutzt es die im Repository
ohnehin vorausgesetzte Node.js-22-Runtime sowie die AWS CLI.

Die App-ID wird ueber das angebundene Repository aufgeloest, nicht fest verdrahtet.
`AMPLIFY_APP_ID` und `AMPLIFY_BRANCH` ueberschreiben die Ermittlung.

### Einzelbefehle

Aktuell angebundene App und Branch ermitteln:

```bash
aws amplify list-apps --query 'apps[].{name:name,appId:appId,platform:platform}' --output table
aws amplify list-branches --app-id <APP_ID> \
  --query 'branches[].{branch:branchName,stage:stage,activeJob:activeJobId}' --output table
```

Job-Historie und einzelner Job mit seinen Phasen:

```bash
aws amplify list-jobs --app-id <APP_ID> --branch-name deploy --max-items 10 \
  --query 'jobSummaries[].{job:jobId,status:status,commit:commitId,start:startTime}' --output table

aws amplify get-job --app-id <APP_ID> --branch-name deploy --job-id <JOB_ID> \
  --query 'job.steps[].{step:stepName,status:status}' --output table
```

`--max-items 10` begrenzt die Gesamtausgabe der automatisch paginierenden AWS CLI auf die zehn
juengsten Jobs. Der Amplify-Serviceparameter `maxResults` begrenzt dagegen nur eine einzelne
API-Antwortseite und wird deshalb hier nicht als Historienlimit verwendet.

Moegliche aktive Jobzustaende sind `CREATED`, `PENDING`, `PROVISIONING`, `RUNNING` und
`CANCELLING`. Ein Job endet in `SUCCEED`, `FAILED` oder `CANCELLED`. Laufendes Deployment bis zum
Endzustand verfolgen:

```bash
until aws amplify get-job --app-id <APP_ID> --branch-name deploy \
        --job-id "$(aws amplify get-branch --app-id <APP_ID> --branch-name deploy \
                    --query 'branch.activeJobId' --output text)" \
        --query 'job.summary.status' --output text | tee /dev/stderr \
      | grep -qE 'SUCCEED|FAILED|CANCELLED'; do sleep 15; done
```

### Logs

Build-Logs liegen als vorsignierte S3-Adresse am jeweiligen Schritt. Die Adresse ist nur eine
Stunde gueltig und wird deshalb bei Bedarf frisch aufgeloest, nicht notiert:

```bash
curl -s "$(aws amplify get-job --app-id <APP_ID> --branch-name deploy --job-id <JOB_ID> \
  --query 'job.steps[?stepName==`BUILD`].logUrl' --output text)" | tail -60
```

Die SSR-Laufzeitlogs der Compute-Umgebung -- Punkt 6 der Abnahme in Abschnitt 6 -- stehen in
CloudWatch unter der Log-Gruppe `/aws/amplify/<APP_ID>`:

```bash
aws logs tail /aws/amplify/<APP_ID> --since 1h --follow --format short
```

### Dieselbe Diagnose reproduzierbar aus GitHub Actions

Die Befehle oben brauchen ein lokal angemeldetes AWS-Profil und sind damit an einen einzelnen
Rechner gebunden. Denselben Zustand liefert der Workflow `Cloud Acceptance` reproduzierbar aus
GitHub Actions: Anmeldung per OIDC an einer ausschliesslich lesenden Rolle, ohne statische
AWS-Schluessel im Repository. Einrichtung, Erstnachweis und Grenzen des Zugangs stehen in
[`23-cloud-abnahme-kanal.md`](23-cloud-abnahme-kanal.md).
