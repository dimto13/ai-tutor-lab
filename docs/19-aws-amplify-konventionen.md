# AWS-Amplify-Konventionen

## Ziel

Verbindliche Regeln für alles, was unter `amplify/` entsteht. Sie stammen nicht aus der
Theorie, sondern aus dem Review eines zweiten, produktiv laufenden Amplify-Gen-2-Projekts
und aus den Fehlern des ersten Hosting-Setups dieses Repos. Wer AITP-83 (Auth) oder
AITP-84 (Fortschrittspersistenz) umsetzt, hält sich daran.

Stand: Amplify Gen 2, `@aws-amplify/backend` 1.x. Gen 2 ist weiterhin der aktuelle Weg;
es gibt keinen Nachfolger, auf den migriert werden müsste.

## 1. Rollen nie über ARN referenzieren

Generierte IAM-Rollen haben Namen wie
`amplify-<appId>-<branch>-amplifyAuthauthenticatedU-zEx82vk5TIuP`. Wird so eine ARN in den
Code geschrieben, bricht sie bei jedem Stack-Neuaufbau und existiert in keiner Sandbox und
keinem Branch-Deployment.

```ts
// falsch
new ArnPrincipal("arn:aws:iam::732574607523:role/amplify-…-zEx82vk5TIuP");

// richtig
backend.auth.resources.authenticatedUserIamRole;
```

Dasselbe gilt für alles andere Generierte: Bucket-Namen, Tabellennamen, User-Pool-IDs. Wenn
eine Bucket-Policy von Hand in der Konsole nachgezogen werden muss, ist das ein Symptom
dieser Regel — nicht der Normalfall.

## 2. Zugriff pro Identität, nie bucket- oder tabellenweit

`allow.authenticated` heißt „jeder angemeldete Nutzer", nicht „der Eigentümer". Wer das
verwechselt, baut eine IDOR-Lücke: Nutzer A liest die Daten von Nutzer B.

```ts
// falsch — jeder Angemeldete kommt an fremde Daten
access: (allow) => ({ "./*": [allow.authenticated.to(["read", "write"])] });

// richtig — an die eigene Identität gebunden
access: (allow) => ({
  "private/{entity_id}/*": [allow.entity("identity").to(["read", "write", "delete"])],
});
```

Im Datenmodell ist `allow.owner()` das Gegenstück. Für den Mandantenbezug aus AITP-84
reicht `owner` allein nicht — `tenantId` gehört zusätzlich in jeden Datensatz und in die
Autorisierungsregel.

## 3. Keine Gast-Identitäten

`allow.guest()` und ein Identity Pool mit unauthentifizierter Rolle öffnen die Umgebung für
jeden. AITP-82 verlangt ausdrücklich das Gegenteil.

```ts
backend.auth.resources.cfnResources.cfnIdentityPool.allowUnauthenticatedIdentities = false;
```

Scaffold-Reste sind hier besonders gefährlich: Das `defineData`-Beispiel von `ampx` legt ein
`Todo`-Modell mit `allow.guest()` an. Es wurde in diesem Repo entfernt, bevor je eine
Backend-Phase lief. Wer `data` wieder aufnimmt, schreibt das Schema selbst.

## 4. Fremdsystem-Geheimnisse gehören nicht ins Datenmodell

Passwörter, API-Keys und Tokens fremder Systeme werden nicht als `a.string()` im Modell
abgelegt. DynamoDB verschlüsselt zwar at rest, aber der Wert bleibt für die API, für jeden
mit Tabellenzugriff und für jede Lambda mit Leserecht lesbar — und er wandert bei
`allow.owner()` wieder in den Browser zurück.

Richtig ist AWS Secrets Manager: Im Modell steht nur eine Referenz-ID, aufgelöst wird
ausschließlich serverseitig, der Client bekommt das Geheimnis nie zu sehen. Für Werte, die
zur Deploy-Zeit feststehen (etwa OIDC-Client-Secrets), ist `secret()` aus
`@aws-amplify/backend` der Weg.

## 5. Ressourcen explizit konfigurieren

Das Scaffold von `ampx` ist ein Startpunkt, kein Ergebnis. Was für Nutzerkonten gilt, soll im
Code stehen und nicht aus einem Default folgen — mindestens `accountRecovery` und
`userAttributes`. `groups` kommt dazu, sobald es ein Rollenmodell gibt; `multifactor` ist für
den Pilotstart bewusst ausgelassen und später ohne Neuanlage des Pools nachrüstbar.

## 6. Lambda-Assets sauber schneiden

`lambda.Code.fromAsset("./amplify/customFunction/x")` packt das Verzeichnis **von der
Platte**, nicht aus Git. Was `.gitignore` ausschließt, landet trotzdem im
Deployment-Paket — `__pycache__`, `.pytest_cache`, `test/`. Testcode gehört nicht in
Produktion, deshalb immer mit `exclude` arbeiten.

## 7. `amplify/` wird geprüft

Der Ordner ist kein npm-Workspace und läuft an `npm run typecheck --workspaces` vorbei. Er
ist deshalb explizit in `lint` und `typecheck:amplify` eingehängt und muss dort bleiben.

## 8. Build-Konfiguration

- `buildPath: /` gehört unter `frontend:` und lässt die Frontend-Phasen im Repo-Root laufen.
  Die `backend:`-Phase kennt den Schlüssel **nicht**.
- Amplify führt alle Phasen in **derselben Shell** aus. Ein `cd` aus `preBuild` wirkt in
  `build` fort. Deshalb nie blind `cd` voranstellen, sondern idempotent:
  `test -f amplify/backend.ts || cd ../..`. Drei fehlgeschlagene Deployments gingen auf
  genau diesen Fehler zurück.
- `ampx` muss im Elternverzeichnis von `amplify/` laufen, also im Repo-Root.
- `amplify_outputs.json` ist generiert, gehört nicht in Git und wird im Build nach
  `apps/web/public/` kopiert. Der Auth-Adapter lädt sie zur Laufzeit per `fetch`, wodurch
  Frontend-Build und Backend-Deploy entkoppelt bleiben.

## Offene Punkte

- Der Backend-Deploy ist noch nicht aktiv: Die Amplify-App hat keine Service-Rolle
  (`iamServiceRoleArn`), ohne die `ampx pipeline-deploy` nicht startet.
- `AdministratorAccess-Amplify` ist die von AWS vorgesehene, aber sehr breite Policy für die
  Service-Rolle. Vor Produktivbetrieb enger schneiden.
