# Operatives Control Plane

Dieses Dokument definiert, wie KI-Agenten, Scheduler und neue Chat-Sessions das aktuell gültige
Implementation-Control finden und wie ein Rollover ohne hardcodierte Issue-Nummern erfolgt.

## Grundsatz

GitHub ist die operative Single Source of Truth. Das aktive Implementation-Control wird ausschließlich
über GitHub-Metadaten gefunden, nicht über eine dauerhaft bekannte Issue-Nummer.

Die kanonische Discovery lautet:

```text
is:issue is:open label:"control:active"
```

Es muss genau **ein** offenes Issue mit dem Label `control:active` existieren.

- genau eins → dieses Issue ist die operative CONTROL-SSOT,
- keines → Control-Plane-Blocker; keine Queue oder alte CONTROL-Nummer erraten,
- mehrere → Control-Plane-Blocker; keine Auswahl anhand von Alter, Nummer oder Chat-Historie treffen.

Eine frühere CONTROL-Issue-Nummer darf nur als historische Referenz in Audit-/Archivkontext vorkommen,
niemals als dauerhafter Discovery-Vertrag in Agentenregeln, CI oder Scheduler-Prompts.

## Session-Bootstrap

Jede neue Worker- oder PLAN-Session rekonstruiert ihren Zustand in dieser Reihenfolge:

1. genau ein offenes `control:active`-Issue ermitteln,
2. dessen vollständigen Body lesen,
3. neueste relevante HANDOFF-/WATCHDOG-/Evidence-Kommentare lesen,
4. aktuellen `main`- und `deploy`-SHA live prüfen,
5. offene PRs mit Base/Head, Mergeability, CI, Reviews und Threads prüfen,
6. letzte verfügbare `push`-CI auf aktuellem `main` prüfen,
7. offene Tracker-Hygiene-Verstöße `is:open label:"hygiene:violation"` prüfen
   ([`29-tracker-hygiene.md`](29-tracker-hygiene.md)),
8. eigenen autorisierten Queue-Punkt, Dependencies und Scope-Kollisionen bestimmen,
9. erst danach mutieren.

Chat-Historie und Modellgedächtnis sind niemals eine Ersatz-SSOT.

## Issue-driven Queue

Das aktive CONTROL definiert die autorisierten Streams, Queue-Reihenfolge, Dependencies und Ausnahmen.

Die Zuweisung eines offenen Issues mit `prio: must` oder `beta:gate` ist verbindlich maschinenlesbar:
Es trägt genau eins von `stream:chat1`, `stream:chat2`, `stream:chat3`, `stream:owner` oder
`work:parked`. PLAN setzt dieses Label beim Dispatch und bei jeder Umverteilung; der Workflow
`Tracker Hygiene` meldet Pflicht-Issues ohne oder mit widersprüchlicher Zuweisung. Regeln und Labels
stehen in [`29-tracker-hygiene.md`](29-tracker-hygiene.md).

Weitere Work-Labels können zusätzlich als maschinenlesbare Arbeitszustände verwendet werden, zum
Beispiel:

```text
work:ready
work:in-progress
work:wait
work:blocked
work:merged-pending-main-ci
```

Fehlt diese feinere Label-Struktur, bleibt der CONTROL-Body für die Queue autoritativ. Agenten dürfen
niemals aus fehlenden Labels neue Arbeit erfinden; ein fehlendes `stream:*`-Label an einem
Pflicht-Issue ist ein Auftrag an PLAN, nicht an den Worker.

## Rollover

Ein CONTROL-Rollover erfolgt kontrolliert:

1. Nachfolger-Issue vollständig vorbereiten: Betriebsvertrag, aktive Queue, Dependencies, Release-Evidence
   und offene Blocker müssen rekonstruierbar sein.
2. Nachfolger noch ohne `control:active` auf Konsistenz prüfen.
3. Nachfolger mit `control:active` aktivieren.
4. Das Label unmittelbar vom Vorgänger entfernen.
5. Vorgänger mit `control:archived` labeln, im Titel als `ARCHIVED` mit Verweis auf den Nachfolger
   kennzeichnen und schließen.
6. Scheduler und Worker ändern keine hartcodierte Issue-Nummer; sie finden beim nächsten Lauf automatisch
   das neue aktive CONTROL.

Während der sehr kurzen Umschaltung kann vorübergehend mehr als ein oder kein aktives CONTROL sichtbar
sein. Dieser Zustand ist absichtlich fail-closed: Worker führen dann keine neue Mutation aus, bis wieder
exakt ein aktives CONTROL vorliegt.

**Rollover-Schwelle.** PLAN bereitet einen Rollover vor, sobald das aktive CONTROL mehr als etwa
150 Kommentare hat oder sein Abschnitt zum aktuellen Stand nicht mehr dem Live-Zustand entspricht und
sich nicht mehr durch eine Body-Aktualisierung in einem Lauf korrigieren lässt. Ein CONTROL, dessen
aktueller Stand nur noch aus den Kommentaren rekonstruierbar ist, verfehlt seinen Zweck: Jede neue
Session muss es vollständig lesen.

## Handoffs

Handoffs werden immer im zur Laufzeit entdeckten aktiven CONTROL geschrieben. Ein Handoff verweist nicht
auf eine dauerhaft konfigurierte CONTROL-Nummer.

**Kommentar-Disziplin.** Ein Handoff-Kommentar entsteht nur bei materieller Änderung: Statuswechsel,
neuer Head, neues CI- oder Review-Ergebnis, neuer oder aufgelöster Blocker. Ein Lauf ohne solche
Änderung schreibt keinen Kommentar; Scheduler-Lebendigkeit wird an den Läufen selbst geprüft, nicht an
wiederholten WAIT-Kommentaren. Der Abschnitt zum aktuellen Stand im CONTROL-Body wird bei jeder
materiellen Änderung mitgezogen, damit der Body ohne Kommentarhistorie stimmt.

Pflichtfelder:

```md
## CHAT-X HANDOFF — YYYY-MM-DD HH:MM Europe/Berlin

- Issue / Queue-Position:
- Branch / PR / Head:
- Status: IN PROGRESS | WAIT | BLOCKED | MERGED_PENDING_MAIN_CI | DONE
- Basis-main:
- PR-CI / Reviews:
- main push-CI nach Merge:
- Ergebnis:
- Dependencies:
- Scope / Dateien:
- Risiken / Kollisionen:
- Nächste exakte Aktion:
- deploy verändert: nein | ja, nur Owner + Referenz
```

## Scheduler

Worker- und Watchdog-Scheduler verwenden dieselbe Discovery-Regel. Ihre Prompts dürfen keine konkrete
CONTROL-Issue-Nummer als Betriebsvertrag enthalten.

Scheduler-Liveness ist vom fachlichen Worker-State getrennt. GitHub/CONTROL bestimmt, ob ein Worker
ausführbare Arbeit besitzt; der Scheduler ist nur der Executor.

- PLAN ist der permanente Supervisor/Dispatcher und bleibt aktiv.
- Hat ein Worker keine aktuell ausführbare Aufgabe (insbesondere `NO_EXECUTABLE_WORK`,
  `WAIT_EXTERNAL`, Owner-only oder reines Idle), darf seine Scheduler-Runtime pausiert sein. PLAN
  reaktiviert ihn nicht zyklisch nur zur Liveness-Kosmetik.
- Vor dem Dispatch prüft PLAN den tatsächlichen Executor: Ein API-only Chat kann keinen Commit, Test
  oder Rebase ausführen. Technische Checkout-Schritte können an eine autorisierte lokale Session
  übergeben werden; Owner-only Release-Freigaben und externe Evidence werden dadurch nicht delegiert.
- Beim Dispatch einer ausführbaren Aufgabe stellt PLAN sicher, dass der zugehörige Worker-Scheduler aktiv
  ist. Während `IN_PROGRESS`, fortsetzbarer CI-/Review-Wartezustände oder anderer ohne Owner-Eingriff
  fortsetzbarer Arbeit ist eine unerwartete Scheduler-Pausierung ein operativer Fehler und wird von PLAN
  korrigiert.
- `MERGED_PENDING_MAIN_CI` und SESSION-CUT pausieren einen Worker mit fortsetzbarer Arbeit nicht.
- `BLOCKED` wird nach Ursache klassifiziert: Ist der Blocker vom Worker selbst weiter prüfbar, bleibt der
  Scheduler aktiv; benötigt er ausschließlich Owner-/External-Evidence, darf er pausieren.
- Worker-Prompts dürfen eine Plattform-Pausierung nicht als fachlichen Abschluss interpretieren. Jeder
  neue Lauf rekonstruiert seinen Zustand erneut aus GitHub.

Damit ist Scheduler-Aktivität kein persistenter Projektzustand und kein Ersatz für Queue-/Handoff-State.

## Merge- und Release-Gates

Die CONTROL-Discovery ändert keine bestehenden Sicherheitsregeln:

- ein Merge ist erst nach grüner `push`-CI auf dem resultierenden `main` operativ DONE,
- während `MERGED_PENDING_MAIN_CI` bleibt die globale Merge-Lane geschlossen,
- `deploy` bleibt Owner-only,
- Cloud-/Manual-Evidence ist SHA-/Artifact-spezifisch und darf nicht erfunden oder umgedeutet werden.

### Maschinenlesbare Main-Push-CI

Die Evidence stammt aus GitHub Actions, Workflow `Code CI` (`.github/workflows/code-ci.yml`). PLAN
ermittelt zuerst den aktuellen `main`-SHA live und filtert die Runs gleichzeitig nach `branch=main`,
`event=push` und genau diesem `head_sha`. Ein `pull_request`- oder `workflow_dispatch`-Run ist kein
Ersatz, auch wenn sein SHA identisch ist.

```sh
gh api repos/dimto13/ai-tutor-lab/branches/main --jq .commit.sha
gh api --method GET repos/dimto13/ai-tutor-lab/actions/workflows/code-ci.yml/runs \
  -f branch=main -f event=push -f head_sha=<main-sha> -f per_page=100
gh api repos/dimto13/ai-tutor-lab/actions/runs/<run-id>
gh api --paginate repos/dimto13/ai-tutor-lab/actions/runs/<run-id>/jobs
```

`<main-sha>` und `<run-id>` sind durch die live ermittelten Werte zu ersetzen. In der verbundenen
GitHub-Lesefläche sind dieselben REST-Pfade und Filter zu verwenden. Aus passenden Runs wird der
neueste gewählt; bei einem Re-Run gilt dessen aktuelle `run_attempt`, niemals ein älterer grüner
Versuch. Die Run-Evidence enthält mindestens `id`, `head_sha`, `head_branch`, `event`, `status`,
`conclusion`, `run_attempt` und `html_url`. Die Jobs müssen vollständig paginiert gelesen werden.

Das Main-Gate ist erst grün, wenn der passende Run **und** alle drei Jobs `validate`,
`e2e-training-modes` und `e2e-production-artifact` jeweils `status=completed` und
`conclusion=success` haben. `queued`, `in_progress`, `failure`, `cancelled`, `timed_out`, `skipped`,
fehlende Jobs, API-Fehler oder fehlende Evidence bleiben fail-closed. Nach der Abfrage wird `main`
erneut gelesen: Hat sich der SHA bewegt, wird die Prüfung für den neuen SHA wiederholt.

Der Handoff nennt den exakten resultierenden Main-SHA, Run-ID/URL, Versuch und die drei Job-Ergebnisse.
Erst dann wird `MERGED_PENDING_MAIN_CI` zu DONE und die globale Merge-Lane freigegeben. Historische
Belege oder der Stand von `deploy` erfüllen dieses Gate nicht.

## CI-Guard

Die Repository-CI prüft den Control-Plane-Vertrag. Dauerhafte Governance-Dateien dürfen keine konkrete
CONTROL-Issue-Nummer hardcodieren. Historische Archive sind davon ausgenommen.
