# Training-State-Persistenz

## Ziel

#45 / AITP-84 fuehrt die serverseitige, nutzer- und mandantenbezogene Persistenz ein, ohne die
Training Engine an AWS zu koppeln. Der fachliche Vertrag ist `TrainingStateRepository`; Browser-
und Cloud-Implementierungen liegen hinter diesem Port.

```text
TrainingProvider / Application Logic
              |
              v
    TrainingStatePersistence
              |
              v
    TrainingStateRepository
       |                |
       v                v
LocalStorage        Remote Adapter
lokal/Migration     Amplify Data
                         |
                         v
                 AppSync Resolver
                         |
                         v
                      DynamoDB
```

## Gemeinsamer Repository-Vertrag

`packages/training-engine/src/persistence.ts` definiert den cloud-neutralen Vertrag fuer:

- `TrainingSession`
- Runtime-Snapshots
- `TrainingStateKey { subject, scenarioId, mode }`
- versionierte Records mit `schemaVersion`, `revision` und `updatedAt`
- Optimistic Concurrency ueber `expectedRevision`

Die Training Engine kennt weder `localStorage` noch Amplify, AppSync oder DynamoDB.

`apps/web/src/state/trainingStatePersistence.ts` serialisiert Schreibvorgaenge und kapselt
Revisionsverwaltung. Ein echter Revisionskonflikt wird nicht durch einen stillen Client-Overwrite
aufgeloest: Die persistierte Autoritaet wird erneut geladen.

## Adapterauswahl

`apps/web/src/persistence/applicationTrainingStateRepository.ts` ist die Composition Root.

- Lokale Entwicklung und E2E verwenden `LocalStorageTrainingStateRepository`.
- Cognito-/Produktionsbetrieb verwendet den lazy geladenen Amplify-Data-Adapter.
- `VITE_TRAINING_STATE_MODE=local|remote` kann die Auswahl explizit setzen.
- Ohne explizite Angabe folgt die Persistenz dem Auth-Modus; Production faellt auf `remote` zurueck.

Der Amplify-Adapter wird dynamisch geladen. Lokale Tests ziehen dadurch kein `aws-amplify/data` in
den lokalen Modulgraphen.

## Browser-Persistenz und Migration

`LocalStorageTrainingStateRepository` ist die lokale Implementierung und Migrationsquelle. Sie
verwendet versionierte Envelopes und trennt Daten nach Mandant, Nutzer, Szenario und Modus.

Bestehende nutzergebundene Session-v3- und Runtime-v2-Eintraege werden lesend in das neue lokale
Format uebernommen. Beim Wechsel auf Remote-Persistenz gilt zusaetzlich eine one-way Migration:

1. Der Remote-Adapter wird immer zuerst gelesen.
2. Nur wenn der Server erfolgreich bestaetigt, dass noch kein Datensatz existiert, darf der
   nutzereigene Browserstand als Migrationskandidat verwendet werden.
3. Dieser Kandidat erhaelt intern Revision `0`; reale Serverrevisionen beginnen bei `1`.
4. Der erste erfolgreiche Remote-Write legt den Serverdatensatz atomar an.
5. Existiert inzwischen ein Serverdatensatz, gewinnt der Serverstand.
6. Ein fehlgeschlagener Server-Read wird niemals durch einen moeglicherweise veralteten Browserstand
   kaschiert.
7. Historische Eintraege mit `tenantId=null` duerfen nur in den deterministischen persoenlichen
   Kontext `personal:<sub>` desselben Nutzers uebernommen werden. Sie werden niemals automatisch in
   einen spaeter zugewiesenen benannten Tenant migriert.

Damit koennen bereits erreichte nutzergebundene Ergebnisse uebernommen werden, ohne die
Serverautoritaet oder Mandantentrennung aufzuweichen. Eine vollstaendige Offline-Synchronisation mit
bidirektionalem Cache bleibt eine separate Ausbaustufe von AITP-14/#8.

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

Die generierten Model-CRUD-Operationen erhalten absichtlich keine Browser-Autorisierungsregel.
Der Browser greift fuer TrainingSession, RuntimeSnapshot und UserPreferences ausschliesslich ueber
authentifizierte Custom Operations zu.

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
- Konflikt: Der Client darf den Serverstand nicht blind ueberschreiben, sondern muss den aktuellen
  autoritativen Zustand laden.

Im Cognito-/Produktionsmodus ist der serverseitige Zustand die persistierte Autoritaet. LocalStorage
ist aktuell lokale Entwicklung plus one-way Migrationsquelle; echte Offline-Synchronisation folgt
in AITP-14/#8.

## Punkte, Kompetenz und Nachweise

`ScoreEvent`, `SkillProfile` und `Attestation` sind bereits Teil des Datenmodells, besitzen in diesem
Persistenz-Slice aber bewusst keinen Client-Mutationspfad.

Die Punkteberechnung und Erzeugung autoritativer ScoreEvents wird in AITP-60/#31 serverseitig
implementiert. Bis dahin kann ein manipuliertes Browserobjekt keinen serverseitigen Punktestand,
Kompetenzstand oder Nachweis erzeugen.

## Deployment

Auch dieser Backend-Slice wird erst ueber den normalen Releasepfad aktiviert:

```text
Feature-PR -> main (nur bei gruener CI) -> manuelle Freigabe des Repository-Eigentuemers
-> git push origin main:deploy -> Amplify pipeline-deploy
```

`deploy` bleibt ein Release-Zeiger und wird von KI-Agenten nicht verschoben.
