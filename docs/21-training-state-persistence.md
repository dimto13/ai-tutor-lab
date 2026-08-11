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
Offline-Puffer      Amplify Data
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

`apps/web/src/state/trainingStatePersistence.ts` serialisiert lokale Schreibvorgaenge und kapselt
Revisionsverwaltung. Ein echter Revisionskonflikt wird nicht durch einen stillen Client-Overwrite
aufgeloest: Die persistierte Autoritaet wird erneut geladen.

## Browser-Persistenz und Migration

`LocalStorageTrainingStateRepository` ist die lokale Implementierung und spaeter der Offline-Puffer.
Sie verwendet versionierte Envelopes und trennt Daten nach Mandant, Nutzer, Szenario und Modus.

Bestehende nutzergebundene Session-v3- und Runtime-v2-Eintraege werden lesend als Revision `0`
uebernommen. Der erste erfolgreiche Schreibvorgang migriert sie auf das neue Format. Dadurch gehen
bereits erreichte Trainingsstaende nicht verloren.

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
Der Browser greift fuer TrainingSession und RuntimeSnapshot ausschliesslich ueber authentifizierte
Custom Operations zu.

## Serverseitige Identitaet

`userId` und `tenantId` sind keine Argumente der Browser-Operationen.

Die AppSync-Resolver bestimmen:

1. `userId` aus der authentifizierten Cognito-Identitaet (`sub`).
2. `tenantId` aus einer serververwalteten Cognito-Gruppe mit Prefix `tenant:`.
3. Ohne Tenant-Gruppe wird fuer den Single-User-/MVP-Fall deterministisch `personal:<sub>` verwendet.
4. Mehr als eine unterschiedliche `tenant:*`-Mitgliedschaft wird abgelehnt, bis eine explizite
   serverseitige Tenant-Auswahl eingefuehrt wird.

Damit kann ein Browser weder fremde `userId`- noch fremde `tenantId`-Werte einschleusen.
Die spaetere Ablage der Membership in einer eigenen Tabelle kann diese Ableitung ersetzen, ohne den
`TrainingStateRepository`-Vertrag zu aendern.

## Konflikte und Autoritaet

Session- und Runtime-Schreibvorgaenge verwenden `expectedRevision`.

- Neuer Datensatz: Schreiben nur, wenn noch kein Eintrag mit dieser ID existiert.
- Bestehender Datensatz: Schreiben nur, wenn die gespeicherte Revision dem erwarteten Wert entspricht.
- Erfolgreicher Write: Revision wird um eins erhoeht und serverseitig zeitgestempelt.
- Konflikt: Der Client darf den Serverstand nicht blind ueberschreiben, sondern muss den aktuellen
  autoritativen Zustand laden.

Der serverseitige Zustand ist nach Einfuehrung des Remote-Adapters die persistierte Autoritaet;
LocalStorage bleibt Cache/Offline-Puffer.

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
