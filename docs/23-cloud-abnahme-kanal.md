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
| GitHub | Environment-Variablen und -Secret (siehe unten)              | Konfiguration des Laufs                                   |
| AWS    | OIDC-Provider `token.actions.githubusercontent.com`          | Vertrauen zu GitHub als Identitätsanbieter                |
| AWS    | Policy `AiTutorCloudAcceptanceReadOnly`                      | eng geschnittene Leserechte                               |
| AWS    | Rolle `AiTutorGitHubReadOnly`                                | wird vom Workflow angenommen                              |
| Repo   | `infra/aws/github-oidc/*.json`                               | Trust-, Berechtigungs- und Bootstrap-Policy               |
| Repo   | `scripts/setup-aws-github-oidc.sh`                           | idempotente Einrichtung der AWS-Seite                     |

### Environment-Konfiguration

| Name               | Art      | Wert                                                       |
| ------------------ | -------- | ---------------------------------------------------------- |
| `AWS_ROLE_ARN`     | Secret   | `arn:aws:iam::<AWS_ACCOUNT_ID>:role/AiTutorGitHubReadOnly` |
| `AWS_REGION`       | Variable | Region der Amplify-App (`us-east-1`)                       |
| `AMPLIFY_APP_ID`   | Variable | `dvycwqmhfzz12`                                            |
| `AMPLIFY_BRANCH`   | Variable | `deploy`                                                   |
| `AMPLIFY_BASE_URL` | Variable | `https://deploy.dvycwqmhfzz12.amplifyapp.com`              |

Region, App-ID und Branch sind Konfiguration und werden als Variablen geführt. Die AWS-Kontonummer
steht bewusst in keiner Repository-Datei, denn dieses Repository ist öffentlich — und damit sind es
auch seine Workflow-Logs.

Genau deshalb liegt der Rollen-ARN als **Secret** vor, obwohl eine Kontonummer kein Geheimnis ist:
GitHub gibt den `env`-Block eines Schrittes im Log aus, **bevor** dessen Skript läuft. Als Variable
stünde die Kontonummer dort, noch bevor `::add-mask::` sie schützen könnte. Secrets maskiert GitHub
von sich aus. Der Maskierungsschritt im Workflow bleibt trotzdem nötig: Er deckt die bloße
Kontonummer auch dort ab, wo sie in anderen Zeichenketten auftaucht — etwa im `assumed-role`-ARN
der STS-Antwort, den die Secret-Maskierung nicht erfasst.

## Einrichtung

Die AWS-Seite ist eine bewusste Handlung des Repository-Eigentümers und braucht ein Profil mit
IAM-Rechten. Das Entwicklerprofil `amplify-dev-user` reicht dafür nicht aus. Für die GitHub-Seite
braucht es entsprechend Adminrechte am Repository — Environment, Variablen und Secrets sind keine
Einstellungen, die ein beliebiger Mitarbeitender setzen kann.

```bash
AWS_PROFILE=<admin-profil> npm run cloud:setup-oidc
```

Fehlen dem Profil die IAM-Rechte, bricht das Skript sofort ab, bevor es irgendetwas anlegt, und
sagt, was fehlt. Dann gibt es zwei Wege.

**Weg 1 — Profil mit IAM-Rechten verwenden.** Der direkte Weg, wenn ein solches Profil existiert.

**Weg 2 — dem vorhandenen Benutzer vorübergehend genau die nötigen Rechte geben.** Dafür liegt
`infra/aws/github-oidc/setup-permissions-policy.json` bereit: eine eng geschnittene Inline-Policy,
die ausschließlich die drei Ressourcen dieses Vorhabens betrifft — den GitHub-OIDC-Provider, die
Policy `AiTutorCloudAcceptanceReadOnly` und die Rolle `AiTutorGitHubReadOnly`. `AttachRolePolicy`
ist zusätzlich per Bedingung auf genau diese eine Policy begrenzt, damit an die neue Rolle nichts
anderes gehängt werden kann.

In der AWS-Konsole unter IAM → Benutzer → `amplify-dev-user` → Berechtigungen → Inline-Policy
anlegen, `<AWS_ACCOUNT_ID>` ersetzen, Skript ausführen, Policy danach wieder entfernen.

Diese Rechte sind bewusst Bootstrap-Rechte auf Zeit: Wer eine Rolle anlegen und Policies daran
hängen darf, kann Berechtigungen ausweiten. Die Beschränkung auf feste Ressourcennamen begrenzt
das, hebt es aber nicht auf — deshalb nach der Einrichtung entfernen. Der laufende Betrieb braucht
sie nicht: Der Workflow selbst kommt ohne IAM-Rechte aus.

Das Skript legt OIDC-Provider, Policy und Rolle an beziehungsweise aktualisiert sie. Ist der
Provider bereits vorhanden, prüft es zusätzlich, ob die Audience `sts.amazonaws.com` registriert
ist, und ergänzt sie sonst — ein aus anderem Anlass angelegter Provider ohne diese Audience führt
sonst zu einem Fehlerbild, das nicht auf seine Ursache zeigt.

Am Ende gibt das Skript den Rollen-ARN, die registrierten Audiences und den vertrauten
Subject-Claim aus. Diese drei Werte sind der Selbstnachweis der Einrichtung: Sie lassen sich direkt
gegen die Ausgabe des ersten Workflow-Laufs halten.

Prüfen lässt sich der Zustand jederzeit ohne das Skript:

```bash
aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com
aws iam get-role --role-name AiTutorGitHubReadOnly --query 'Role.AssumeRolePolicyDocument'
```

Die GitHub-Seite — Environment, Branch-Beschränkung auf `main`, Variablen und Secret — ist bereits
eingerichtet. Abweichende Werte lassen sich mit
`gh variable set <NAME> --env cloud-acceptance --body "<wert>"` beziehungsweise
`gh secret set AWS_ROLE_ARN --env cloud-acceptance --body "<arn>"` korrigieren.

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


## Automatische Release-Abnahmekette

Die Release-Abnahme ist dreistufig und an einen **exakten deploy-SHA** gebunden:

1. Ein Push auf `deploy` startet `Cloud Release Acceptance Trigger`. Dieser Workflow hat keine
   AWS-Rechte und verschiebt keinen Ref. Er dispatcht ausschließlich `Cloud Acceptance` auf `main`
   und übergibt den exakten `deploy`-SHA.
2. `Cloud Acceptance` wartet lesend auf den Amplify-Job für genau diesen SHA und akzeptiert ihn nur,
   wenn der Job sowie `BUILD`, `DEPLOY` und `VERIFY` erfolgreich sind. Danach folgen Backend-
   Zuordnung, SSR-/CloudWatch-Diagnose und der HTTP-Smoke. Nur ein vollständig erfolgreicher Lauf
   veröffentlicht das Artefakt `cloud-acceptance-evidence` mit deploy-SHA und Amplify-Job-ID.
3. Ein erfolgreicher `Cloud Acceptance`-Lauf startet automatisch `Cloud User Acceptance`. Dieser
   lädt die Evidence aus exakt dem auslösenden Workflow-Run, checkt genau den bestätigten deploy-SHA
   aus und führt die authentifizierten Cognito/AppSync-/Web-UI-Tests gegen die reale Amplify-URL aus.
   Vor und nach den Tests wird geprüft, dass `deploy` unverändert auf diesem SHA steht.

Damit ist ein grüner UI-Lauf nicht auf "ungefähr dem aktuellen Deployment", sondern auf derselben
Release-Revision wie die AWS-Abnahme. Bewegt sich `deploy` während der Kette, ist die Abnahme
ungültig und schlägt fail-closed fehl.

Zusätzlich läuft `Cloud Acceptance` täglich zeitversetzt. Ein erfolgreicher täglicher Lauf löst
ebenfalls `Cloud User Acceptance` aus und dient als Drift-Monitoring für die bereits deployte
Umgebung. Der manuelle `Cloud User Acceptance`-Trigger bleibt für Diagnosezwecke erhalten, zählt
aber ohne vorgelagerte exakte Cloud-Acceptance-Evidence nicht als Release-Freigabe.

Die Environment-Beschränkung auf `main` bleibt unverändert. Der `deploy`-Push selbst übernimmt
keine AWS-Rolle; die OIDC-Trust-Grenze wird daher für diese Automatisierung nicht aufgeweicht.

## Erstnachweis

Workflow `Cloud Acceptance` manuell auf `main` starten (`workflow_dispatch`). Erfolgreich ist der
Kanal erst, wenn drei Dinge im Lauf sichtbar sind:

1. `aws sts get-caller-identity` meldet eine angenommene Rolle `AiTutorGitHubReadOnly`.
2. `aws amplify get-app --app-id dvycwqmhfzz12` liefert die App.
3. Die Job-Historie zeigt den aktuellen Deployment-Stand des Branches `deploy`.

Die AWS-Kontonummer wird in den Logs maskiert, weil Workflow-Logs öffentlicher Repositories
öffentlich lesbar sind. `***` an dieser Stelle ist also der Normalfall, kein Fehler.

## Fehlerbilder

| Symptom                                                   | Ursache und Behandlung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `The web identity token provided could not be validated`  | AWS kann das Token keinem registrierten Provider zuordnen (`InvalidIdentityToken`). Die Meldung zeigt nicht auf ihre Ursache: Sie erscheint sowohl, wenn der OIDC-Provider gar nicht existiert — also die Einrichtung noch aussteht — als auch, wenn er existiert, aber `sts.amazonaws.com` nicht in seiner `ClientIDList` steht. Beides klärt `npm run cloud:setup-oidc`; das Skript legt an oder ergänzt die Audience und gibt beide Werte am Ende aus. Ob die Rolle überhaupt existiert, beantwortet `aws iam get-role --role-name AiTutorGitHubReadOnly`. |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Provider und Token passen, aber der Subject-Claim weicht von der Trust-Policy ab. Der Schritt „OIDC-Claims dieses Jobs anzeigen“ läuft vor der Anmeldung und gibt den tatsächlichen `sub` aus — diesen Wert in `infra/aws/github-oidc/trust-policy.json` übernehmen und `npm run cloud:setup-oidc` erneut ausführen.                                                                                                                                                                                                                                          |
| Anmeldung schlägt direkt nach der Ersteinrichtung fehl    | IAM ist eventual consistent. Nach einigen Sekunden erneut starten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Environment-Secret AWS_ROLE_ARN fehlt`                   | Secret im Environment `cloud-acceptance` nachtragen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `AccessDenied` bei einem Diagnosebefehl                   | Die Aktion fehlt in `read-only-policy.json`. Ergänzen, `npm run cloud:setup-oidc` erneut ausführen — und dabei lesend bleiben.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Schritt „Reale Anwendung aufrufen“ meldet HTTP 500        | Der Build war erfolgreich, die SSR-Umgebung startet aber nicht. Der Schritt „SSR-Laufzeitlogs prüfen“ im selben Lauf zeigt die Ursache.                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Grenzen des Zugangs

- Ausschließlich `List`/`Get`/`Describe`. Kein `Create`, `Update`, `Delete`, `StartJob`.
- Kein AWS-managed `ReadOnlyAccess` und kein `AdministratorAccess`.
- Kein DynamoDB-Datenzugriff: Persistenz wird über die reale Anwendung beziehungsweise AppSync
  geprüft, nicht durch Lesen der Tabellen.
- Cognito und AppSync nur als Metadaten — welche Ressourcen existieren, nicht deren Inhalte.

Nach dem ersten erfolgreichen Lauf lassen sich die `Resource: "*"`-Einträge zusätzlich auf die
konkreten ARNs einschränken.

## Cloud User Acceptance

Der Workflow [`Cloud User Acceptance`](../.github/workflows/cloud-user-acceptance.yml) ist die
zustandsverändernde, aber ausschließlich über öffentliche Produktgrenzen arbeitende Abnahmestufe.
Er besitzt keine AWS-IAM-Rechte. Dedizierte Cognito-Testkonten melden sich über die reale Web-App an
und prüfen AppSync/Persistenz, Isolation und die zentralen Web-UI-Pfade.

Für Completion/Scoring gilt eine zusätzliche Qualitätsgrenze: Ein Test, der nur die Sichtbarkeit des
Labels „Punkte“ prüft, ist kein Score-Nachweis. Der reale Guided-Abschluss muss einen
serverbestätigten numerischen Score zeigen; nach vollständigem Reload beziehungsweise frischem
Browserkontext müssen derselbe Abschluss und derselbe Score weiterhin vorhanden sein. Direkte
GraphQL-Tests bleiben Backend-Contract-Tests, ersetzen aber diesen UI-Orchestrierungsnachweis nicht,
weil sie Save und Award bewusst sequenziell aufrufen und damit UI-Races nicht erkennen können.

Die Testkonten und Passwörter liegen ausschließlich als Secrets im GitHub-Environment
`cloud-acceptance`. AWS-Zugangsdaten gehören nicht in diesen Workflow.
