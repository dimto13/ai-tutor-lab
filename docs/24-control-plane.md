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

- PLAN/WATCHDOG, CHAT1, CHAT2 und CHAT3 bleiben als kanonische Scheduler dauerhaft aktiviert.
  WAIT, BLOCKED, `NO_EXECUTABLE_WORK`, `WAIT_EXTERNAL`, Owner-only, Idle, laufende CI/Reviews,
  SESSION-CUT oder Toolfehler erlauben weder Pausierung noch Deaktivierung, Löschen oder Umplanen.
  Ein Idle-Worker rekonstruiert GitHub beim nächsten Lauf und beendet ihn ohne erfundene Arbeit.
  Legacy-Duplikate bleiben deaktiviert; unverwandte Owner-Automationen bleiben unangetastet.
- Vor dem Dispatch prüft PLAN den tatsächlichen Executor: Ein API-only Chat kann keinen Commit, Test
  oder Rebase ausführen. Technische Checkout-Schritte können an eine autorisierte lokale Session
  übergeben werden; Owner-only Release-Freigaben und externe Evidence werden dadurch nicht delegiert.
- Beim Dispatch einer ausführbaren Aufgabe stellt PLAN sicher, dass der zugehörige Worker-Scheduler aktiv
  ist. Während `IN_PROGRESS`, fortsetzbarer CI-/Review-Wartezustände oder anderer ohne Owner-Eingriff
  fortsetzbarer Arbeit ist eine unerwartete Scheduler-Pausierung ein operativer Fehler und wird von PLAN
  korrigiert.
- `MERGED_PENDING_MAIN_CI` und SESSION-CUT pausieren einen Worker mit fortsetzbarer Arbeit nicht.
- `BLOCKED` wird nach Ursache klassifiziert, aber nicht durch eine Scheduler-Pausierung beantwortet.
- Worker-Prompts dürfen eine Plattform-Pausierung nicht als fachlichen Abschluss interpretieren. Jeder
  neue Lauf rekonstruiert seinen Zustand erneut aus GitHub.
- PLAN prüft tatsächlichen Aktivierungszustand, letzten geplanten Lauf und Ergebnis in der
  Scheduler-Runtime. Kommentare sind kein Liveness-Nachweis. Fehlt dieser Zugriff, wird die
  Monitoring-Lücke als UNKNOWN dokumentiert; „aktiv“ oder „repariert“ darf nicht erfunden werden.

Damit ist Scheduler-Aktivität kein persistenter Projektzustand und kein Ersatz für Queue-/Handoff-State.

## External-Executor-Eskalation

PLAN bleibt alleiniger Dispatcher. Jenkins und Coding-Worker wählen nie selbst ein Issue aus. Ein
externer Auftrag ist nur für bereits durch CONTROL autorisierte Arbeit mit klarer Acceptance,
erfüllten Dependencies und kollisionsfreiem Dateiscope zulässig. Ausführung: Jenkins→RMI als `tobi`,
nicht `msi`. Der vorhandene SSH-Pfad reicht; eine Registrierung als Jenkins-Agent ist kein Bestandteil
dieses Vertrags. Checkout, Code, Tests und Build laufen auf RMI; Modellinferenz erfolgt beim Anbieter.
Der Modellprozess läuft im dedizierten Docker-Build-Image auf RMI, nicht mit Vollzugriff auf den Host
oder im Jenkins-Controller. Root-FS und `.git` sind read-only, nur Checkout und eigener Ausgabeordner
sind schreibbar. Kein Docker-Socket, Jenkins-Home oder SSH-Schlüssel wird eingebunden. Die vorhandene
Codex-Anmeldung wird als einzelne read-only Datei eingebunden; sie ist damit im Container lesbar.
Netzwerk für den Provider ist verfügbar, nicht technisch domain-gefiltert. Die Repository-Trust-Grenze
bleibt wichtig; Prompts sind kein vollständiger Schutz gegen Credential-Exfiltration. Containergrenzen
ersetzen die innere Codex-Sandbox; AppArmor/sysctl auf RMI und `msi` bleiben unverändert.

PLAN unterscheidet folgende technisch ausführbare Eskalationsgründe:

- `CAPABILITY_MISMATCH`: konkrete nächste Aktion bekannt, aber Cloud-/API-Worker hat keinen Checkout,
  Repository-Write, Browser, Runtime oder die erforderliche Toolchain.
- `STALLED`: derselbe actionable technische Blocker über zwei aufeinanderfolgende geplante Läufe ohne
  materiellen Fortschritt. Fehlende Kommentare allein erfüllen diese Schwelle nicht.
- `CI_REPAIR`: rote erforderliche PR-/Main-CI benötigt eine konkret abgegrenzte Code-/Test-Reparatur.
- `LOCAL_RUNTIME_REQUIRED`: reproduzierbarer Bug mit klarer Acceptance benötigt lokale Runtime-Evidence.
- `EXECUTOR_CAPACITY`: Cloud-Worker haben keine fortsetzbare eigene Arbeit, aber eine unabhängige,
  autorisierte und klar abgegrenzte Implementierungsaufgabe ist verfügbar.

Keine Coding-Eskalation bei normal laufender CI oder Review, `WAIT_EXTERNAL`, Owner-only Evidence,
Deploy-Promotion, Credentials/Secrets, Kosten-/Business-/Legal-Entscheidungen, fehlender Acceptance,
offenen Dependencies, Scope-Kollisionen, nicht autorisierter Arbeit oder uneindeutigem CONTROL.

### Maschinenlesbarer Auftrag

Genau ein **operativer**, nicht in einem Markdown-Codeblock stehender Kommentar wird verwendet:

```text
<!-- external-executor:v1
{
  "status": "REQUESTED",
  "issue": <dynamisch zugewiesene Issue-Nummer>,
  "reason": "CAPABILITY_MISMATCH",
  "action": "IMPLEMENT",
  "scope": ["apps/web/src/components/overlay/", "tests/runtime/overlayPlacement.test.ts"],
  "acceptance": "Konkrete aus dem Issue abgeleitete Kriterien und Regressionstests",
  "dependencies": [],
  "basis-main": "<live ermittelter vollständiger main-SHA>",
  "merge": "forbidden",
  "deploy": "forbidden",
  "self-select-work": "forbidden"
}
-->
```

`reason` ist einer der fünf obigen Werte; `action` ist `IMPLEMENT`, `REPAIR`, `TEST` oder `REBASE`.
`scope` enthält ausschließlich konkrete Dateien oder mit `/` abgeschlossene Verzeichnisse unter
`apps/web/`, `packages/` oder `tests/`. Agentenregeln, Hooks, Workflows, Runner, Dependencies und
Infrastruktur sind nicht an diesen Coding-Worker delegiert. `dependencies` enthält Issue-Nummern,
die live CLOSED sein müssen, oder `[]` für unabhängige Arbeit. Das Issue selbst bleibt OPEN und trägt
`stream:owner`. PLAN verantwortet zusätzlich die fachliche Dependency-/Acceptance-Prüfung.

`token` und `branch: owner/<issue>-<kurzname>` können explizit angegeben werden. Ohne diese Felder
leitet der Executor beide deterministisch aus dem vollständigen Auftrag ab. Ein materiell geänderter
Auftrag benötigt eine neue Identität; bestehende Arbeit wird nicht überschrieben. Vor Start muss
`basis-main` dem aktuellen Main-SHA entsprechen. Vor Veröffentlichung werden Auftrag und CONTROL
erneut entdeckt und verglichen; Änderung oder Rollover erhält die Arbeit ohne Push.

Die frühere Form `<!-- external-executor:v1 -->` gefolgt von `key: value` wird bis zum nächsten
Abschnitt/Kommentar ebenfalls gelesen. Listen werden dabei als JSON-Arrays geschrieben; freie
„Funktionsbereiche“, YAML-Blöcke oder fehlende Felder sind kein ausführbarer Dateiscope und werden
fail-closed abgewiesen. `dependencies` muss auch in dieser Form vorhanden sein. Beispiele in
Codeblöcken und der alte `jenkins-local-dispatch:v1` aktivieren keine Arbeit.

`DISABLED`, `CANCELLED`, `PREPARED` und `DONE` sind keine ausführbaren Aufträge. Der Executor quittiert
einen vollständig bearbeiteten Request persistent und führt denselben Auftrag nicht erneut aus.
TEST und REBASE benötigen keinen Modelllauf. REBASE verwendet eine bestehende PR-Branch; ein grünes
Testergebnis erzeugt keinen künstlichen Commit oder PR.

### Kontingentreserve und Skip

Autonome Übernahme ist ausschließlich bei **50–100 Prozent Restkontingent in jedem relevanten
Zeitfenster des ausdrücklich konfigurierten Anbieters** zulässig. Es zählt das Minimum, nicht der
Mittelwert. 50 Prozent ist inklusive; fehlende, ungültige oder veraltete Zahlen erlauben keinen Start.
Codex nutzt `account/rateLimits/read` aus dem App Server: `100 - usedPercent`, einschließlich
5-Stunden- und Wochenfenster und aller gelieferten Buckets. Dies ist eine Kontoabfrage, kein
Modellaufruf. API-Key-/Paid-Credits sind kein Ersatz für die verlangte Abonnement-Reserve.

Unter 50 Prozent: `SKIPPED_QUOTA` für den restlichen Kalendertag Europe/Berlin. Unbekannte Quota:
`SKIPPED_QUOTA_UNKNOWN` mit mindestens 15 Minuten Retry-Abstand. Kein Clone, Install, Test, Build oder
Modellstart. PLAN erhält genau einen aktuellen `executor-quota:v1`-Status im CONTROL-Body, ohne
Kommentarspam. PLAN dispatcht/retriggert denselben Skip nicht erneut, schaltet keinen Anbieter um,
kauft keine Credits und verbraucht keinen automatischen Quota-Reset. Die Scheduler bleiben aktiv.

Am nächsten Tag wird frisch geprüft; ein unverändert knappes Wochenfenster bleibt SKIP. Positive
Quota-Snapshots werden niemals als spätere Startfreigabe gecacht. Vor jedem Modellstart erfolgt eine
erneute Abfrage; lange Modellläufe werden minütlich kontrolliert und bei SKIP beendet, ohne Commit
oder Push und unter Erhalt der Arbeit. Providerzahlen sind gerundet/verzögert; bereits laufende
Requests können noch Verbrauch verursachen. Die Schwelle ist kein token-genauer Verbrauchsdeckel.

RMI hat derzeit einen authentifizierten Codex-Executor. Claude ist nicht installiert; bis eine
verlässliche Quota-Abfrage plus Invocation integriert und getestet ist, ist `claude` UNKNOWN/SKIP,
kein stiller Fallback und kein erfundenes Kontingent.

### Ergebnis und unabhängige PLAN-Prüfung

Der Executor verwendet `worker:doctor/start/sync/push/gate` auf einer isolierten Feature-Branch,
liefert echte Tests, PR-Head, Main-Basis und Handoff und endet höchstens PREPARED/TESTED. Kein Merge,
kein deploy, keine Owner-Gates, keine erfundene externe/manual Evidence, kein Scope-Upgrade.
Nach Rückgabe prüft PLAN unabhängig aktuellen Head/Basis/Rebase, vollständige Exact-Head-CI,
Reviews/Threads/Findings, Acceptance, Scope, Preservation und die globale Merge-Lane. Integration
bleibt seriell und nach Merge bis zur grünen exakten resulting-main push-CI geschlossen.

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
