# 24 — Sichtbarkeit von Punkten und Ranglisten

## 24.1 Serverautoritative Tenant-Policy

Die Sichtbarkeit von Punkten und tenantbezogenen Auswertungen wird ausschließlich durch die
persistierte `TenantScoreVisibilityPolicy` im Amplify-Data-Layer bestimmt. Clientzustand oder
UI-Ausblendungen sind keine Autoritätsquelle.

Fehlt für einen Tenant ein Policy-Datensatz, gilt serverseitig zwingend:

- `visibility = private`
- `leaderboardsEnabled = false`
- keine `named`-Freigabe

Tenantbezogene Score-Reads akzeptieren keinen `tenantId` vom Client. Der Tenant wird aus der
signierten Cognito-Gruppenzugehörigkeit `tenant:<id>` abgeleitet. Fehlende, leere oder
widersprüchliche Tenant-Gruppen werden fail-closed abgewiesen.

## 24.2 Sichtbarkeitsstufen

### `private`

Nur der bestehende owner-scoped Score-Pfad der lernenden Person bleibt sichtbar. Der
tenantbezogene Scoreboard-Read liefert keine Kohortengröße, keine Summen, keine Mittelwerte und
keine personenbezogenen Einträge.

### `aggregate`

Der Reporting-Pfad aggregiert ausschließlich bestehende `ScoreEvent`-Einträge des authentifizierten
Tenants. Eine Kohorte wird über eindeutige `userId`-Werte bestimmt.

Für Kohorten mit weniger als fünf Personen werden keine Ergebniswerte ausgegeben. Erst ab
`n >= 5` werden Kohortengröße, Gesamtpunkte und Durchschnittspunkte geliefert. Personenbezogene
Einträge bleiben leer.

### `named`

`named` darf nur durch `role:tenant_admin` gespeichert werden. Die Mutation verlangt gleichzeitig:

1. eine explizite Bestätigung der Freigabe und
2. eine nichtleere Dokumentationsreferenz, zum Beispiel auf eine Betriebsvereinbarung oder einen
   gleichwertigen tenantinternen Freigabenachweis.

Der Server ergänzt die Freigabe selbst um das bestätigende Admin-Subject und den Zeitpunkt. Diese
Felder können nicht vom Client gesetzt werden. Ein persistierter `named`-Zustand ohne vollständige
Freigabeinformationen wird beim Lesen als ungültig abgewiesen.

Personenbezogene Ranglisteneinträge werden zusätzlich nur ausgegeben, wenn Ranglisten ausdrücklich
aktiviert sind und der aufrufende Serverkontext `tenant_admin` ist. Die bestehende Trainer-Rolle
behält damit ausschließlich ihre Berechtigung für aggregiertes Reporting.

## 24.3 Scoring- und Persistenzgrenzen

AITP-100 führt keine zweite Punktequelle und keine materialisierte Ranglistentabelle ein.
Tenantbezogene Auswertungen lesen das bestehende serverautoritativ erzeugte `ScoreEvent`-Ledger über
einen Tenant-Index. `SkillProfile` bleibt die vorhandene owner-scoped Projektion aus `ScoreEvent` und
`ScenarioRun`.

Da keine Score- oder Ranking-Daten dupliziert persistiert werden, entsteht kein paralleler
Retention-/Deletion-Lebenszyklus. Bestehende Score-, Telemetrie-, Retention- und
Deletion-Infrastruktur bleibt unverändert.
