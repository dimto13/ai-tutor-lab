# Cloud-Abnahmekanal: GitHub Actions → AWS (lesend)

## Zweck

Ein grüner CI-Lauf beweist nur, dass `main` baut. Er sagt nichts darüber, wie sich die real
deployte Umgebung verhält — genau die Lücke, die auf `deploy` zum HTTP-500-Fall geführt hat
(`docs/19-aws-amplify-konventionen.md`, Abschnitt 2). Bisher war AWS-Verhalten nur indirekt über
die Oberfläche beobachtbar oder über die lokale AWS-CLI eines einzelnen Rechners.

Der Workflow [`Cloud Acceptance`](../.github/workflows/cloud-acceptance.yml) schließt diese Lücke:
GitHub Actions meldet sich per OpenID Connect mit einem kurzlebigen Token an einer
**ausschließlich lesenden** IAM-Rolle an und macht Amplify, Cognito, AppSync, CloudWatch und die
reale Anwendungs-URL reproduzierbar sichtbar. Der Kanal ist Voraussetzung für die Cloud-Abnahme
von #44/#45 und anschließend #8.

**Der Workflow deployt nichts.** Die Deployment-Freigabe bleibt unverändert der bewusste
`git push origin main:deploy` des Repository-Eigentümers.

## Warum OIDC und keine AWS-Schlüssel

GitHub fordert das Token beim eigenen OIDC-Provider an, AWS prüft es gegen die Trust-Policy der
Rolle und gibt Credentials mit kurzer Laufzeit zurück. Im Repository liegt damit kein
AWS-Access-Key, der geleakt, rotiert oder vergessen werden könnte. Die Job-Berechtigung
`id-token: write` erlaubt für sich genommen keinen AWS-Zugriff — sie erlaubt nur, ein
GitHub-Token anzufordern. Ob daraus Zugriff wird, entscheidet allein AWS.

## Bestandteile

| Ort    | Artefakt                                                     | Zweck                                                     |
| ------ | ------------------------------------------------------------ | --------------------------------------------------------- |
| GitHub | Environment `cloud-acceptance`, auf Branch `main` beschränkt | Teil des Subject-Claims und damit der Vertrauensbeziehung |
| GitHub | Environment-Variablen (siehe unten)                          | Konfiguration, keine Geheimnisse                          |
| AWS    | OIDC-Provider `token.actions.githubusercontent.com`          | Vertrauen zu GitHub als Identitätsanbieter                |
| AWS    | Policy `AiTutorCloudAcceptanceReadOnly`                      | eng geschnittene Leserechte                               |
| AWS    | Rolle `AiTutorGitHubReadOnly`                                | wird vom Workflow angenommen                              |
| Repo   | `infra/aws/github-oidc/*.json`                               | die beiden Policies als versionierte Quelle               |
| Repo   | `scripts/setup-aws-github-oidc.sh`                           | idempotente Einrichtung der AWS-Seite                     |

### Environment-Variablen

| Name               | Wert                                                       |
| ------------------ | ---------------------------------------------------------- |
| `AWS_ROLE_ARN`     | `arn:aws:iam::<AWS_ACCOUNT_ID>:role/AiTutorGitHubReadOnly` |
| `AWS_REGION`       | Region der Amplify-App (`us-east-1`)                       |
| `AMPLIFY_APP_ID`   | `dvycwqmhfzz12`                                            |
| `AMPLIFY_BRANCH`   | `deploy`                                                   |
| `AMPLIFY_BASE_URL` | `https://deploy.dvycwqmhfzz12.amplifyapp.com`              |

Rollen-ARN, Region und App-ID sind Konfiguration, keine Passwörter, und werden deshalb als
Variablen und nicht als Secrets geführt. Die AWS-Kontonummer steht bewusst in keiner
Repository-Datei: dieses Repository ist öffentlich.

## Einrichtung

Die AWS-Seite ist eine bewusste Handlung des Repository-Eigentümers und braucht ein Profil mit
IAM-Rechten. Das Entwicklerprofil `amplify-dev-user` reicht dafür nicht aus.

```bash
AWS_PROFILE=<admin-profil> npm run cloud:setup-oidc
```

Das Skript legt OIDC-Provider, Policy und Rolle an beziehungsweise aktualisiert sie und gibt am
Ende den Rollen-ARN aus. Die GitHub-Seite — Environment, Branch-Beschränkung auf `main` und die
Variablen — ist bereits eingerichtet; abweichende Werte lassen sich mit
`gh variable set <NAME> --env cloud-acceptance --body "<wert>"` korrigieren.

### Subject-Claim

Die Trust-Policy bindet die Rolle an genau ein Repository und genau ein Environment:

```
repo:dimto13@93082815/ai-tutor-lab@1327473496:environment:cloud-acceptance
```

Die numerischen Bestandteile sind die unveränderlichen Owner- und Repository-IDs. GitHub
verwendet dieses Format seit dem 15. Juli 2026 standardmäßig für neu erstellte Repositories;
dieses Repository wurde am 8. August 2026 erstellt und fällt darunter. Das ältere Format
`repo:dimto13/ai-tutor-lab:environment:cloud-acceptance` gilt hier also nicht.

Weil bei einem Environment-Job der Branch nicht Teil des Subject-Claims ist, ersetzt die
Branch-Beschränkung des Environments diese Absicherung. Sie darf nicht entfernt werden — sonst
könnte ein beliebiger Branch die Rolle annehmen.

## Erstnachweis

Workflow `Cloud Acceptance` manuell auf `main` starten (`workflow_dispatch`). Erfolgreich ist der
Kanal erst, wenn drei Dinge im Lauf sichtbar sind:

1. `aws sts get-caller-identity` meldet eine angenommene Rolle `AiTutorGitHubReadOnly`.
2. `aws amplify get-app --app-id dvycwqmhfzz12` liefert die App.
3. Die Job-Historie zeigt den aktuellen Deployment-Stand des Branches `deploy`.

Die AWS-Kontonummer wird in den Logs maskiert, weil Workflow-Logs öffentlicher Repositories
öffentlich lesbar sind. `***` an dieser Stelle ist also der Normalfall, kein Fehler.

## Fehlerbilder

| Symptom                                                   | Ursache und Behandlung                                                                                                                                                                                                                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Subject-Claim und Trust-Policy weichen ab. Der Schritt „OIDC-Claims dieses Jobs anzeigen“ läuft vor der Anmeldung und gibt den tatsächlichen `sub` aus — diesen Wert in `infra/aws/github-oidc/trust-policy.json` übernehmen und `npm run cloud:setup-oidc` erneut ausführen. |
| Anmeldung schlägt direkt nach der Ersteinrichtung fehl    | IAM ist eventual consistent. Nach einigen Sekunden erneut starten.                                                                                                                                                                                                            |
| `Environment-Variable AWS_ROLE_ARN fehlt`                 | Variable im Environment `cloud-acceptance` nachtragen.                                                                                                                                                                                                                        |
| `AccessDenied` bei einem Diagnosebefehl                   | Die Aktion fehlt in `read-only-policy.json`. Ergänzen, `npm run cloud:setup-oidc` erneut ausführen — und dabei lesend bleiben.                                                                                                                                                |
| Schritt „Reale Anwendung aufrufen“ meldet HTTP 500        | Der Build war erfolgreich, die SSR-Umgebung startet aber nicht. Der Schritt „SSR-Laufzeitlogs prüfen“ im selben Lauf zeigt die Ursache.                                                                                                                                       |

## Grenzen des Zugangs

- Ausschließlich `List`/`Get`/`Describe`. Kein `Create`, `Update`, `Delete`, `StartJob`.
- Kein AWS-managed `ReadOnlyAccess` und kein `AdministratorAccess`.
- Kein DynamoDB-Datenzugriff: Persistenz wird über die reale Anwendung beziehungsweise AppSync
  geprüft, nicht durch Lesen der Tabellen.
- Cognito und AppSync nur als Metadaten — welche Ressourcen existieren, nicht deren Inhalte.

Nach dem ersten erfolgreichen Lauf lassen sich die `Resource: "*"`-Einträge zusätzlich auf die
konkreten ARNs einschränken.

## Nächster Schnitt

Auf diesem Kanal folgt die Playwright-Abnahme gegen die reale Amplify-URL mit einem dedizierten
Cognito-Testnutzer. Dafür kommen zwei Environment-Secrets hinzu — `CLOUD_TEST_EMAIL` und
`CLOUD_TEST_PASSWORD` —, ausschließlich für einen eigens angelegten Testnutzer. AWS-Zugangsdaten
gehören auch dann nicht in dieses Repository.
