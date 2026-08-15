# 22 — Serverautoritative Scoring Engine

## Zweck

Die Punktevergabe ist eine serverseitige Fachfunktion. Der Browser darf Trainingszustand erfassen,
Abschlüsse darstellen und eine Wertung anfordern, aber **keine autoritativen Punkte, Szenario-Versionen
oder Eigentümerdaten setzen**.

Der cloud-neutrale Domänenvertrag liegt in `packages/training-engine/src/scoring.ts`. AWS Amplify /
AppSync ist die erste Infrastrukturimplementierung hinter diesem Vertrag.

## Fachliche Formel

Für die aktuell registrierte Szenario-Version gilt:

- 70 % Basispunkte,
- 30 % Bonus,
- Explore ×0,5,
- Guided ×1,0,
- Challenge ×2,0,
- Hilfestufen reduzieren ausschließlich den Bonus,
- je Schritt zählt nur die höchste genutzte Hilfestufe,
- Fehlversuche werden auditiert, reduzieren die Punkte aber nicht.

Die Hilfestufen verwenden weiterhin die bestehende `helpPolicy.ts` als fachlichen SSOT:

- Level 1: 10 % des Schrittbonus,
- Level 2: 25 % des Schrittbonus,
- Level 3: 50 % des Schrittbonus.

Solange das Szenario keine eigenen Step-Weights besitzt, wird der Bonus gleichmäßig auf die effektiven
Guided-Schritte verteilt.

## Vertrauensgrenze

```text
Browser / CompletionScreen
        |
        | awardScenarioScore(scenarioId, mode)
        | KEINE points / scenarioVersion / userId / tenantId
        v
AppSync Pipeline
        |
        +--> TrainingSession: owner-scoped, konsistentes Lesen
        |      - Abschluss prüfen
        |      - Hint-/Attempt-Evidence lesen
        |
        +--> serverseitige Scoring-Definition
        |      - Basispunkte
        |      - Szenario-Version
        |      - Modus
        |
        +--> ScoreEvent: atomar append-once
               - Punkte-Breakdown
               - Session-/Source-Revision
               - Zeitstempel
```

Die Cognito-/Gruppenidentität wird ausschließlich im Resolver normalisiert. Persönliche Nutzer erhalten
serverseitig den Owner-Scope `personal:<sub>`; Mandanten werden aus genau einer `tenant:<id>`-Gruppe
abgeleitet. Mehrdeutige Mandantenzugehörigkeit wird abgelehnt.

## Idempotenz und Ledger

Ein Szenario darf pro Nutzer/Mandant und `scenarioVersion` nur einmal Punkte erzeugen. Die fachliche
Award-Identität besteht deshalb aus:

```text
TrainingSubjectRef + scenarioId + scenarioVersion
```

Session-ID und Trainingsmodus sind bewusst nicht Teil des Deduplication-Key. Ein Retry, Reconnect oder
ein erneuter Übungsdurchlauf derselben Szenario-Version darf keinen zweiten Punktegewinn erzeugen.

Der AWS-Adapter verwendet einen deterministischen ScoreEvent-Key und einen konditionalen DynamoDB
`PutItem`. Existiert derselbe Award bereits, wird das vorhandene Ereignis unverändert zurückgegeben und
`created: false` geliefert. Es gibt kein Update bestehender ScoreEvents und keine Client-CRUD-Operationen
auf der ScoreEvent-Tabelle.

`ScoreEvent` ist damit ein append-only Ledger-Ereignis. Der gespeicherte Breakdown enthält mindestens:

- Szenario-Basispunkte,
- 70-%-Basis,
- 30-%-Bonus,
- Bonusabzug durch Hinweise,
- tatsächlich verdienten Bonus,
- Modus-Multiplikator,
- vergebene Punkte,
- Zahl der Fehlversuche,
- höchste Hint-Stufe je Schritt.

## Leseweg

`listMyScoreEvents(limit)` ist ein authentifizierter Read-only-Zugriff. Die Abfrage nutzt den dedizierten
Owner-/Zeitindex `scoreEventsByOwnerTime`; der Browser kann keinen fremden Owner-Key übergeben.

Die Completion-UI zeigt das vom Server zurückgegebene Ereignis. Bei einer Wiederholung zeigt sie
`0 neu` und erläutert, dass das bestehende Ledger-Ereignis unverändert bleibt.

Im lokalen Trainings-/E2E-Modus werden bewusst keine Ersatzpunkte im Browser berechnet. Dadurch gibt es
keine zweite Punkteautorität neben dem Server.

## Offline und Race zwischen Session-Save und Wertung

Die Score-Mutation liest die persistierte Session. Falls der finale Session-Write beim Öffnen der
Abschlussansicht noch nicht serverseitig sichtbar ist oder die Verbindung fehlt, darf die Wertung
vorübergehend fehlschlagen. Der Client wiederholt ausschließlich denselben idempotenten Award-Command
und versucht ihn nach einem Reconnect erneut. Er berechnet niemals lokale Ersatzpunkte.

## Szenario-Versionen

Der Scoring-Adapter besitzt für die aktuell produktiv registrierten Szenarien eine explizite
`scenarioVersion` (`"1"`). Diese Version ist **nicht** `Scenario.environment.version`; letztere bezeichnet
die Produkt-/Runtime-Version und hat eine andere Semantik.

Eine neue fachliche Szenario-Version muss in einem späteren Anti-Gaming-/Content-Schritt bewusst erhöht
werden. Erst dadurch wird dasselbe Szenario erneut punktefähig. Das ist der Anschluss an #32 / AITP-61.

## Sicherheitsinvarianten

1. `awardScenarioScore` akzeptiert nur `scenarioId` und `mode`.
2. Punkte, Szenario-Version und Eigentümer werden serverseitig bestimmt.
3. Nur eine persistierte abgeschlossene Session ist wertbar.
4. Challenge erfordert `challengeOutcome = passed`.
5. ScoreEvents sind append-only und je Award-Identität atomar eindeutig.
6. Generierte CRUD-Operationen der ScoreEvent-Tabelle bleiben deaktiviert.
7. Cloud-SDKs bleiben im Web ausschließlich unter `adapters/`.
8. Die UI zeigt Serverergebnisse und besitzt keinen autoritativen Punkte-Fallback.
