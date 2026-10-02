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

WAIT, BLOCKED, laufende CI, temporär fehlende Evidence, `MERGED_PENDING_MAIN_CI` und SESSION-CUT dürfen
keinen Worker automatisch deaktivieren. Der nächste geplante Lauf rekonstruiert den Zustand erneut aus
GitHub.

## Merge- und Release-Gates

Die CONTROL-Discovery ändert keine bestehenden Sicherheitsregeln:

- ein Merge ist erst nach grüner `push`-CI auf dem resultierenden `main` operativ DONE,
- während `MERGED_PENDING_MAIN_CI` bleibt die globale Merge-Lane geschlossen,
- `deploy` bleibt Owner-only,
- Cloud-/Manual-Evidence ist SHA-/Artifact-spezifisch und darf nicht erfunden oder umgedeutet werden.

## CI-Guard

Die Repository-CI prüft den Control-Plane-Vertrag. Dauerhafte Governance-Dateien dürfen keine konkrete
CONTROL-Issue-Nummer hardcodieren. Historische Archive sind davon ausgenommen.
