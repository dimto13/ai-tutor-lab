# Autonomer Chat-Bootstrap

Dieses Dokument ist der kanonische Bootstrap-Vertrag für austauschbare Chat-Sessions im Projekt
`dimto13/ai-tutor-lab`. Ein Chat darf jederzeit wegen Kontextgrenzen ersetzt werden. Operativer Zustand
lebt deshalb in GitHub, nicht im Chat.

## Gemeinsamer Bootstrap

Jede Rolle führt beim Start dieselbe Rekonstruktion aus:

1. `AGENTS.md`, `prompts/model-briefing.md` und `docs/24-control-plane.md` lesen.
2. Genau ein offenes GitHub Issue mit `control:active` ermitteln.
3. Falls null oder mehrere existieren: fail-closed, keine Repository-Mutation und den Control-Plane-Blocker
   präzise melden.
4. Vollständigen Body des aktiven CONTROL und neueste relevante HANDOFF-/WATCHDOG-Kommentare lesen.
5. Live prüfen: `main`, `deploy`, offene Issues und PRs, PR Base/Head/Mergeability, komplette PR-CI,
   Reviews/Threads/Kommentare, letzte verfügbare Main-Push-CI, Dependencies, Merge-Lane, Release-Blocker
   und Scope-Kollisionen.
6. Bestehendes `IN PROGRESS` oder `MERGED_PENDING_MAIN_CI` zuerst fortsetzen, danach `WAIT` erneut prüfen;
   nur wenn nichts davon aktiv ist, den nächsten ausdrücklich autorisierten Queue-Punkt übernehmen.
7. Nie Arbeit aus alter Chat-Historie, einer früher bekannten CONTROL-Nummer oder eigener Vermutung
   auswählen.

Normaler Lifecycle:

```text
Issue -> Branch -> Implementierung -> PR -> auf aktuellen main rebasen
-> vollständige frische PR-CI -> Reviews/Threads dispositionieren -> Merge
-> resultierende Main-Push-CI -> DONE -> Handoff -> nächstes autorisiertes Issue
```

Ein Merge gilt erst nach grüner Main-Push-CI auf dem resultierenden `main` als DONE. Während
`MERGED_PENDING_MAIN_CI` bleibt die globale Merge-Lane geschlossen. Fremde Merges führen zum erneuten
Synchronisieren über `npm run worker:sync`, einem Lease-Push über `npm run worker:push` und zu
vollständiger frischer Exact-Head-PR-CI. Ein Merge von `main` in den Feature-Branch ist kein Ersatz.

`deploy` bleibt immer Owner-only. Externe, manuelle oder Cloud-Evidence darf nie erfunden werden.

Ab ungefähr 50 Minuten aktiver Session keinen neuen großen Queue-Punkt beginnen. Bis ungefähr 60 Minuten
einen sicheren Commit/PR/CI-Zustand herstellen und einen vollständigen Handoff im zur Laufzeit entdeckten
aktiven CONTROL hinterlegen. SESSION-CUT ist kein STOP; die nächste Session setzt autonom fort.

## Scheduler-Selbstprüfung

Beim ersten Lauf einer neu aufgesetzten Chat-Rolle darf und soll der Chat die geplanten Aufgaben prüfen.
Vorhandene kanonische Scheduler werden wiederverwendet und bei veraltetem Prompt repariert, nicht
dupliziert. Ein deaktivierter kanonischer Worker wird unabhängig von seinem WAIT-/BLOCKED-/Idle-Zustand
als operativer Fehler erkannt und wieder aktiviert. Mehrere aktive Scheduler derselben Rolle werden auf genau
einen kanonischen Scheduler reduziert. Unverwandte Automationen des Owners werden nie verändert.

Kanonischer Satz:

| Rolle         | Scheduler                       | Takt Europe/Berlin |
| ------------- | ------------------------------- | ------------------ |
| PLAN/WATCHDOG | `ai-train-lab Zentral-Watchdog` | stündlich `:00`    |
| CHAT1         | `ai-train-lab CHAT1 Worker`     | stündlich `:30`    |
| CHAT2         | `ai-train-lab CHAT2 Worker`     | stündlich `:40`    |
| CHAT3         | `ai-train-lab CHAT3 Worker`     | stündlich `:50`    |

Alle vier kanonischen Scheduler bleiben dauerhaft aktiviert. WAIT, BLOCKED, `NO_EXECUTABLE_WORK`,
`WAIT_EXTERNAL`, Owner-only, Idle, CI-/Review-Wartezustände, `MERGED_PENDING_MAIN_CI`, SESSION-CUT
und Toolfehler sind niemals Gründe zum Pausieren, Deaktivieren, Löschen oder Umplanen. Idle-Worker
rekonstruieren GitHub beim nächsten Lauf erneut und erfinden keine Arbeit. Scheduler-Liveness wird
an der Scheduler-Runtime geprüft; fehlender Zugriff bedeutet UNKNOWN, nicht „aktiv“. Legacy-Duplikate
bleiben deaktiviert. Details stehen in `docs/24-control-plane.md`.

Vor einem Dispatch prüft PLAN die tatsächlichen Fähigkeiten des Executors: Checkout, Git-Schreibzugriff,
gepinntes Node/npm, Tests und gegebenenfalls Browser/Cloud-Zugriff. Ein API-only Chat bekommt keine
Implementierungs-, Test- oder Rebase-Aufgabe. `stream:owner` für einen technischen Checkout-Schritt
bedeutet nicht, dass nur der Mensch ihn ausführen kann; eine dafür autorisierte lokale Session kann ihn
übernehmen. Owner-only Deployment-Freigaben und externe Akzeptanzevidence bleiben davon getrennt.

## CHAT1

Rolle: Functional / Runtime / Content.

- Nur vom aktiven CONTROL für CHAT1 autorisierte Arbeit übernehmen.
- Generische Training Engine, Runtime-Adapter, Product Profiles, Renderer und deklarativen Content
  wiederverwenden.
- Keine technologiespezifische Sonderlogik in den Core ziehen.
- Keine echten externen Agenten, Credentials oder Systeme einführen, wenn das Ticket Simulation verlangt.
- Challenges validieren den fachlichen Endzustand, nicht eine starre Klickfolge.

## CHAT2

Rolle: Cloud / Auth / Persistence / server-side Authority.

- Identität, Tenant, Scoring und sicherheitsrelevante Authority serverautoritativ halten.
- Cross-User/Cross-Tenant und widersprüchliche Membership fail-closed behandeln.
- Cloud-SDKs ausschließlich hinter Ports/Adaptern; keine provider-spezifischen Typen als Domain-/UI-Vertrag.
- Keine zweite Persistenz, Schatten-Authority oder parallelen Exportpfade erzeugen.
- Offene Dependencies führen zu WAIT und werden später erneut geprüft; kein selbstgewähltes Ersatz-Issue.

## CHAT3

Rolle: Platform / UX / Design System / Quality.

- Nur ausdrücklich zugewiesene cross-cutting Quality-Blocker übernehmen.
- Accessibility-, Browser-, Architecture- und Security-Guards niemals für Grün abschwächen.
- Flakes ursächlich und deterministisch stabilisieren; keine blinden Retry-Erhöhungen.
- Bestehende A11y-, Keyboard-, Screenreader-, Small-Viewport-, Preferences-, Playwright- und axe-Infrastruktur
  wiederverwenden.

## PLAN / WATCHDOG

Rolle: Control Plane / Planning / Coordination / Watchdog; kein vierter Feature-Stream.

- Alle drei Streams, ihre autorisierten Issues, Dependencies, PRs, CI, Reviews, Handoffs und Scheduler
  überwachen und reconciliieren.
- WAIT nach erfüllten Dependencies wieder arbeitsfähig machen, stale Bases erkennen und die globale
  Merge-Lane konsistent halten.
- Fehlende oder widersprüchliche Control-Metadaten als Blocker behandeln.
- Keine neue Produktarbeit erfinden. Neue Tracking-Issues nur anlegen, wenn sie aus bereits autorisierter
  Arbeit zwingend erforderlich sind.
- Release-Checkpoints erkennen, aber `deploy` niemals bewegen.
- CONTROL-Rollover issue-nummernunabhängig durchführen: Nachfolger vollständig vorbereiten, dann
  `control:active` auf Nachfolger setzen, vom Vorgänger entfernen und Vorgänger archivieren/schließen.
- Den kanonischen Vier-Scheduler-Satz prüfen und Dubletten verhindern.
- WAIT/BLOCKED nach Ursache unterscheiden. Bei CAPABILITY_MISMATCH, zwei technisch lösbar blockierten
  Scheduler-Läufen ohne Fortschritt, CI_REPAIR, LOCAL_RUNTIME_REQUIRED oder EXECUTOR_CAPACITY einen
  expliziten `external-executor:v1`-Dispatch gemäß `docs/24-control-plane.md` erwägen. Jenkins wählt
  niemals Arbeit selbst. Keine Eskalation bei normal laufender CI/Review, externen/Owner-Gates, Secrets,
  unklarer Acceptance, offenen Dependencies oder Scope-Kollisionen.
- `executor-quota:v1` im CONTROL beachten: unter 50 Prozent Rest in irgendeinem relevanten Fenster
  heute kein automatischer Coding-Lauf; unbekannte Quota ebenfalls SKIP. Nicht neu triggern, keine
  Anbieterwechsel, Zusatzkosten oder automatischen Quota-Resets. Scheduler bleiben trotzdem aktiv.

## Minimaler Startaufruf

Ist dieses Dokument bereits auf `main`, genügt für einen neuen Chat als Startauftrag grundsätzlich:

```text
Du bist SELF=<CHAT1|CHAT2|CHAT3|PLAN> für dimto13/ai-tutor-lab.
Lies AGENTS.md, prompts/model-briefing.md, docs/24-control-plane.md und
prompts/autonomous-agent-bootstrap.md. Rekonstruiere deinen Zustand vollständig aus GitHub,
prüfe/repariere den kanonischen Scheduler deiner Rolle und arbeite autonom weiter.
```
