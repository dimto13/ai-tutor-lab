# Training-State-Persistenz

## Ziel

#45 / AITP-84 fuehrt die serverseitige, nutzer- und mandantenbezogene Persistenz ein, ohne die
Training Engine an AWS zu koppeln. AITP-14/#8 ergaenzt darauf den revisionssicheren Offline-Puffer.
Der fachliche Vertrag bleibt `TrainingStateRepository`; Browser- und Cloud-Implementierungen liegen
hinter diesem Port.

```text
TrainingProvider / Application Logic
              |
              v
    TrainingStatePersistence
              |
              v
OfflineBufferedTrainingStateRepository
       |                         |
       |                         v
       |                OfflineTrainingStateStore
       |                  Browser Cache/Outbox
       v
MigratingTrainingStateRepository
       |                |
       v                v
Remote Adapter      LocalStorage
Amplify Data        Legacy-Migration
       |
       v
AppSync Resolver -> DynamoDB
```

## Gemeinsamer Repository-Vertrag

`packages/training-engine/src/persistence.ts` definiert den cloud-neutralen Vertrag fuer:

- `TrainingSession`
- Runtime-Snapshots
- `TrainingStateKey { subject, scenarioId, mode }`
- versionierte Records mit `schemaVersion`, `revision` und `updatedAt`
- Optimistic Concurrency ueber `expectedRevision`
- `TrainingStateUnavailableError` als enges Signal fuer temporaere Transport-/Netzwerkausfaelle

Die Training Engine kennt weder `localStorage` noch Amplify, AppSync oder DynamoDB.

`apps/web/src/state/trainingStatePersistence.ts` serialisiert Schreibvorgaenge und kapselt
Revisionsverwaltung. Ein echter Revisionskonflikt wird nicht durch einen stillen Client-Overwrite
aufgeloest: Die persistierte Autoritaet wird erneut geladen.

Die optionale Reconnect-Faehigkeit liegt bewusst **nicht** im Training-Engine-Port. Sie wird als
Web-Anwendungscapability `PendingTrainingStateSynchronization` modelliert. Damit bleiben lokale oder
spaetere alternative Persistenzadapter frei von Browser-/Offline-Konzepten.

## Adapterauswahl

`apps/web/src/persistence/applicationTrainingStateRepository.ts` ist die Composition Root.

- Lokale Entwicklung und E2E verwenden `LocalStorageTrainingStateRepository` direkt.
- Cognito-/Produktionsbetrieb verwendet den lazy geladenen Amplify-Data-Adapter.
- Davor liegt `MigratingTrainingStateRepository` fuer die einmalige Uebernahme alter Browserstaende.
- Ganz aussen liegt `OfflineBufferedTrainingStateRepository` mit einem getrennten
  `OfflineTrainingStateStore` als Browser-Cache und Outbox.
- `VITE_TRAINING_STATE_MODE=local|remote` kann die Auswahl explizit setzen.
- Ohne explizite Angabe folgt die Persistenz dem Auth-Modus; Production faellt auf `remote` zurueck.

Der Amplify-Adapter wird dynamisch geladen. Lokale Tests ziehen dadurch kein `aws-amplify/data` in
den lokalen Modulgraphen.

## Browser-Persistenz und Legacy-Migration

`LocalStorageTrainingStateRepository` ist die lokale Implementierung und Legacy-Migrationsquelle.
Sie verwendet versionierte Envelopes und trennt Daten nach Mandant, Nutzer, Szenario und Modus.

Bestehende nutzergebundene Session-v3- und Runtime-v2-Eintraege werden lesend in das neue lokale
Format uebernommen. Beim Wechsel auf Remote-Persistenz gilt weiterhin die one-way Migration:

1. Der Remote-Adapter wird immer zuerst gelesen.
2. Nur wenn der Server erfolgreich bestaetigt, dass noch kein Datensatz existiert, darf der
   nutzereigene Browserstand als Migrationskandidat verwendet werden.
3. Dieser Kandidat erhaelt intern Revision `0`; reale Serverrevisionen beginnen bei `1`.
4. Der erste erfolgreiche Remote-Write legt den Serverdatensatz atomar an.
5. Existiert inzwischen ein Serverdatensatz, gewinnt der Serverstand.
6. Ein fehlgeschlagener Server-Read wird niemals durch einen Legacy-Browserstand kaschiert.
7. Historische Eintraege mit `tenantId=null` duerfen nur in den deterministischen persoenlichen
   Kontext `personal:<sub>` desselben Nutzers uebernommen werden. Sie werden niemals automatisch in
   einen spaeter zugewiesenen benannten Tenant migriert.

Legacy-Migration und Offline-Puffer sind bewusst getrennte Verantwortlichkeiten. Der
`LocalStorageTrainingStateRepository` bleibt Migrationsquelle; der neue Offline-Store fuehrt eigene,
versionierte Cache-/Outbox-Schluessel.

## Offline-Puffer und Reconnect-Synchronisation

`OfflineBufferedTrainingStateRepository` implementiert den Offline-Teil von AITP-14/#8, ohne die
Serverautoritaet aufzuweichen.

### Grundregel

Jeder Cache-/Outbox-Eintrag merkt sich die **zuletzt beobachtete Remote-Revision** als
`remoteRevision`. Offline-Schreibvorgaenge erhoehen diese Revision nicht lokal. Mehrere Aenderungen
koennen deshalb zu einem letzten lokalen Kandidaten zusammengefasst werden, waehrend dieselbe
Remote-CAS-Basis erhalten bleibt.

Beispiel:

```text
Server Revision 7
      |
      v
Browser offline
  Aenderung A -> Basis bleibt 7
  Aenderung B -> Basis bleibt 7, A wird durch B ersetzt
      |
      v
Reconnect
  save(expectedRevision=7, value=B)
      |
      +-- Server noch 7 -> Erfolg, Server wird 8
      |
      `-- Server bereits 8 -> Konflikt, Serverzustand gewinnt
```

Damit entsteht kein geraeteuebergreifendes `last write wins`.

### Verhalten im Detail

1. Erfolgreiche Remote-Reads und -Writes aktualisieren den lokalen Cache.
2. Bei einem temporaeren Transportausfall darf aus diesem Cache gelesen werden.
3. Session- und Runtime-Writes werden bei Transportausfall als `pending` gespeichert. Mehrere
   Offline-Writes fuer denselben Schluessel werden auf den letzten Kandidaten koalesziert.
4. Runtime-Loeschungen werden als Tombstone gepuffert, sodass auch `save -> delete` bzw.
   `delete -> save` offline deterministisch auf derselben Remote-Basis abgebildet werden koennen.
5. Fuer die aktive TrainingSession hoert der `TrainingProvider` auf das Browser-`online`-Event und
   ruft `synchronizeAfterReconnect(...)` auf. Dabei werden **nur pending Eintraege** synchronisiert;
   bereits saubere Records erhalten keine zusaetzliche Revision.
6. Ist beim Reconnect keine aktive TrainingSession gemountet, bleibt der Puffer dauerhaft erhalten.
   Beim naechsten Zugriff auf denselben Session-/Runtime-Key wird der pending Eintrag vor dem Read
   synchronisiert. Damit geht auch ein ueber einen Browser-Neustart liegender Offline-Stand nicht
   verloren.
7. Bei Erfolg wird der Cache auf die neue Serverrevision gesetzt und `pending` entfernt.
8. Bei `TrainingStateConflictError` wird der aktuelle Serverstand geladen, der lokale Kandidat
   verworfen und der Serverzustand als Autoritaet gecacht. Fuer die aktive Session wird dieser Stand
   sofort in den React-State uebernommen. Ein konkurrierender Runtime-Snapshot wird vor weiteren
   Runtime-Writes wiederhergestellt; bis zur erfolgreichen Wiederherstellung bleiben Writes fuer
   diesen Runtime-Key blockiert.
9. Wenn beim ersten Offline-Zugriff noch kein Cache existiert, darf lokal mit einem neuen Zustand
   gearbeitet werden. Seine Create-Basis bleibt `null`; intern kann Revision `0` als sichtbarer
   Offline-/Migrations-Sentinel auftreten. Beim Reconnect ist der Server-Create weiterhin
   konditional, sodass ein inzwischen existierender Serverdatensatz nicht ueberschrieben wird.

### Welche Fehler Offline-Fallback ausloesen duerfen

Der Offline-Puffer wird **nur** bei `TrainingStateUnavailableError` aktiviert. Der Amplify-Adapter
uebersetzt dafuer ausschliesslich typische Fetch-/Netzwerkfehler in dieses Signal.

Nicht als Offline-Fall behandelt werden insbesondere:

- fehlende oder abgelaufene Authentifizierung
- fehlende Autorisierung
- AppSync-/Schemafehler
- ungueltige Serverdaten
- fachliche Validierungsfehler
- Revisionskonflikte

Diese Fehler werden normal weitergegeben. Dadurch kann ein kaputtes oder falsch konfiguriertes
Backend nicht scheinbar erfolgreich hinter altem Browserzustand weiterlaufen.

### Browser-Speicher ist eine harte Dauerhaftigkeitsgrenze

Ein Offline-Write darf nur als erfolgreich gepuffert gelten, wenn der Browser den Outbox-Eintrag
wirklich in `localStorage` speichern konnte. `QuotaExceededError` und vergleichbare Schreibfehler
werden deshalb **nicht** geschluckt. Der Adapter kapselt sie als `OfflineTrainingStateStorageError`
und laesst den Write fehlschlagen. Ein Warning ohne Fehler waere fachlich falsch, weil die Anwendung
sonst Dauerhaftigkeit behaupten wuerde, obwohl der Offline-Stand nur noch im Arbeitsspeicher liegt.

## Serverseitiges Datenmodell

`amplify/data/resource.ts` enthaelt mindestens:

- `UserProfile`
- `UserPreferences`
- `TrainingSession`
- `StepState`
- `RuntimeSnapshot`
- `HintUsage`
- `Attempt`
- `ScoreEvent`
- `SkillProfile`
- `Attestation`

Jeder dauerhafte fachliche Datensatz traegt explizit `tenantId` und `userId`.

Amplify verlangt auch fuer Models ohne generierten Browserzugriff eine explizite
Autorisierungsregel. Die servereigenen Models verwenden deshalb `allow.authenticated()`, waehrend
`disableOperations(["queries", "mutations", "subscriptions"])` die generierten Model-CRUD- und
Subscription-Operationen vollstaendig deaktiviert. Ein leeres Authorization-Regelset ist nicht
ausreichend, weil der Amplify-Schema-Transform es weiterhin als fehlende Authorization ablehnt.

Der Browser greift fuer TrainingSession, RuntimeSnapshot und UserPreferences ausschliesslich ueber
authentifizierte Custom Operations zu. Dadurch oeffnet `allow.authenticated()` keinen direkten
Model-Pfad, ueber den `userId` oder `tenantId` an den serverseitigen Resolvern vorbei manipuliert
werden koennten.

`UserPreferences` besitzt einen eigenen Persistenzpfad und ist nicht Teil des Session-Payloads.
Sprache, bevorzugter Trainingsmodus, Wochenziel und Accessibility-Einstellungen koennen dadurch
unabhaengig von einer konkreten Trainingssession erweitert und versioniert werden.

## Serverseitige Identitaet

`userId` und `tenantId` sind keine Argumente der Browser-Operationen.

Die AppSync-Resolver bestimmen:

1. `userId` aus der authentifizierten Cognito-Identitaet (`sub`).
2. `tenantId` aus einer serververwalteten Cognito-Gruppe mit Prefix `tenant:`.
3. Ohne Tenant-Gruppe wird fuer den Single-User-/MVP-Fall deterministisch `personal:<sub>` verwendet.
4. Mehr als eine unterschiedliche `tenant:*`-Mitgliedschaft wird abgelehnt, bis eine explizite
   serverseitige Tenant-Auswahl eingefuehrt wird.

Der Web-Auth-Adapter verwendet dieselbe Normalisierung aus dem signierten Cognito-Token: `sub` ist
die kanonische `userId`, genau eine `tenant:*`-Gruppe die `tenantId`, andernfalls gilt
`personal:<sub>`. Damit stimmen der lokale `TrainingSubjectRef` und der serverseitige AppSync-Kontext
ueberein, ohne ein selbst aenderbares Profilattribut zu vertrauen.

Damit kann ein Browser weder fremde `userId`- noch fremde `tenantId`-Werte einschleusen.
Die spaetere Ablage der Membership in einer eigenen Tabelle kann diese Ableitung ersetzen, ohne den
`TrainingStateRepository`-Vertrag zu aendern.

## Konflikte und Autoritaet

Session-, Runtime- und Preference-Schreibvorgaenge verwenden `expectedRevision`.

- Neuer Datensatz: Schreiben nur, wenn noch kein Eintrag mit dieser ID existiert.
- Bestehender Datensatz: Schreiben nur, wenn die gespeicherte Revision dem erwarteten Wert entspricht.
- Erfolgreicher Write: Revision wird um eins erhoeht und serverseitig zeitgestempelt.
- Offline-Write: Die zuletzt bekannte Remote-Revision bleibt als CAS-Basis unveraendert.
- Reconnect ohne Konkurrenz: Der letzte gepufferte Kandidat wird gegen diese Basis geschrieben.
- Reconnect mit Konkurrenz: Der konditionale Write scheitert; der Serverstand wird geladen und gewinnt.

Im Cognito-/Produktionsmodus ist der serverseitige Zustand immer die persistierte Autoritaet.
LocalStorage ist Cache, Outbox und Legacy-Migrationsquelle, aber keine zweite gleichberechtigte
Wahrheit.

## Punkte, Kompetenz und Nachweise

`ScoreEvent`, `SkillProfile` und `Attestation` sind bereits Teil des Datenmodells, besitzen in diesem
Persistenz-Slice aber bewusst keinen Client-Mutationspfad.

Die Punkteberechnung und Erzeugung autoritativer ScoreEvents wird in AITP-60/#31 serverseitig
implementiert. Bis dahin kann ein manipuliertes Browserobjekt keinen serverseitigen Punktestand,
Kompetenzstand oder Nachweis erzeugen.

## CI-Validierung

Der gemeinsame `TrainingStateRepository`-Contract laeuft fuer lokale, Amplify- und
offline-gepufferte Implementierungen. Zusaetzliche Offline-Tests pruefen insbesondere:

- mehrere Offline-Writes gegen dieselbe Remote-CAS-Basis
- Wiederaufnahme des gepufferten Zustands nach Browser-/Repository-Neustart
- explizite pending-Synchronisation fuer Browser-Reconnect
- Serverautoritaet bei konkurrierender Geraeteaenderung
- gepufferte Runtime-Loeschungen
- kein Fallback bei Auth-/Anwendungsfehlern
- enge Klassifizierung von Amplify-Fetch-/Netzwerkfehlern
- fail-loud-Verhalten bei Browser-Quota-/Storage-Schreibfehlern

`typecheck:amplify` prueft nur TypeScript und fuehrt den Amplify-Schema-Transform nicht aus. Deshalb
wird das exportierte `schema` zusaetzlich mit `scripts/validate-amplify-schema.mjs` transformiert.
`npm run validate:amplify-schema` laeuft sowohl in `npm run check` als auch als eigener CI-Schritt
nach dem Typecheck.

Dieser Guard faengt Laufzeitfehler des Data-Schemas — insbesondere fehlende oder ungueltige
Authorization-Regeln — bereits vor Merge und Release ab. Er ersetzt bewusst keine vollstaendige
CDK-Synthese und keinen realen Cloud-Deploy; Stack-/IAM-/CloudFormation-Probleme koennen weiterhin
erst in der Amplify-Pipeline sichtbar werden.

## Deployment und reale Abnahme

Auch dieser Slice wird erst ueber den normalen Releasepfad aktiviert:

```text
Feature-PR -> main (nur bei gruener CI) -> manuelle Freigabe des Repository-Eigentuemers
-> git push origin main:deploy -> Amplify pipeline-deploy
```

`deploy` bleibt ein Release-Zeiger und wird von KI-Agenten nicht verschoben.

Die Code-/Contract-Tests beweisen die Konflikt- und Offline-Semantik reproduzierbar. Die finale reale
Cross-Device-Abnahme von #8/#45 benoetigt weiterhin einen echten Cognito-Testnutzer im geschuetzten
Cloud-Acceptance-Environment und ist ein separates Release-Gate.
