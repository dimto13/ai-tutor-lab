# Tracker-Hygiene

Dieses Dokument beschreibt drei Zustände, die im Board nicht still bestehen bleiben dürfen, und den
Guard, der sie erkennt. Der Guard ist der Workflow `Tracker Hygiene`
([`.github/workflows/tracker-hygiene.yml`](../.github/workflows/tracker-hygiene.yml)) mit dem Skript
[`scripts/tracker-hygiene.mjs`](../scripts/tracker-hygiene.mjs).

## Warum ein Guard

Die drei Zustände sind einzeln harmlos und in Summe teuer: Ein Pflicht-Issue ohne Zuweisung wird von
keinem Worker aufgenommen, weil Work-Stealing nur über PLAN läuft. Ein ohne Merge geschlossener PR
lässt offen, ob die Änderung ersetzt, verworfen oder vergessen wurde. Ein als erledigt geschlossenes
Issue ohne Code auf `main` sieht im Board fertig aus und ist es nicht. Eine Regel, die nur in einem
Dokument steht, wird in genau dem Lauf vergessen, in dem es darauf ankommt.

## Die drei Regeln

| Regel                   | Verstoß                                                                                                 | Reaktion des Guards                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `must-ownership`        | Offenes Issue mit `prio: must` oder `beta:gate` hat nicht **genau eins** von: `stream:*`, `work:parked` | Label `hygiene:violation`, Kommentar |
| `pr-closed-unmerged`    | PR ohne Merge geschlossen, ohne Abschlussgrund                                                          | Wiederöffnen, Label, Kommentar       |
| `issue-closed-unproven` | Issue geschlossen, ohne Code-Beleg auf `main` und ohne Abschlussgrund                                   | Wiederöffnen, Label, Kommentar       |

Der Kommentar nennt jeweils den nächsten exakten Schritt. Pro Element und Regel gibt es höchstens einen
Guard-Kommentar; er wird aktualisiert statt neu geschrieben und als „behoben“ markiert, sobald die Regel
erfüllt ist. Dann verschwindet auch das Label.

Ein wiedergeöffnetes Element behält `hygiene:violation`, solange es offen ist: Es schuldet noch einen
regelkonformen Abschluss. Das Label verschwindet beim nächsten korrekten Schließen, also mit dem Merge
des PRs, der `Closes #…` trägt, oder mit einem Abschlussgrund.

## Labels

| Label               | Bedeutung                                                                     |
| ------------------- | ----------------------------------------------------------------------------- |
| `stream:chat1`      | Zugewiesen an CHAT1                                                           |
| `stream:chat2`      | Zugewiesen an CHAT2                                                           |
| `stream:chat3`      | Zugewiesen an CHAT3                                                           |
| `stream:owner`      | Nur durch den Repository-Eigentümer erledigbar, zum Beispiel externe Evidence |
| `work:parked`       | Bewusst nicht in Bearbeitung; die Begründung steht im Issue                   |
| `wontfix`           | Abschlussgrund: wird nicht umgesetzt (won't fix / won't implement)            |
| `invalid`           | Abschlussgrund: trifft nicht zu                                               |
| `duplicate`         | Abschlussgrund: Duplikat; braucht einen Verweis auf das Original              |
| `superseded`        | Abschlussgrund: durch anderes Element ersetzt; braucht einen Verweis          |
| `hygiene:violation` | Vom Guard gesetzt; offener Verstoß gegen eine der drei Regeln                 |
| `control:archived`  | Archiviertes CONTROL-Issue; wie `control:active` von den Regeln ausgenommen   |

Die Zuweisung eines Pflicht-Issues ist damit maschinenlesbar. PLAN setzt das `stream:*`-Label, wenn er
dispatcht oder umverteilt; die Queue-Reihenfolge steht weiterhin im aktiven CONTROL.

## Richtig schließen

**Ein PR** wird gemergt. Wird er ohne Merge geschlossen, kommt **vorher** ein Abschlussgrund:

1. bei Ersatz einen Kommentar `Superseded by #123` schreiben und das Label `superseded` setzen,
2. bei Duplikat einen Kommentar `Duplicate of #123` schreiben und das Label `duplicate` setzen,
3. sonst `wontfix` oder `invalid` setzen, möglichst mit einem Satz zur Begründung,
4. dann schließen.

**Ein Issue** wird durch den Merge des PRs geschlossen, der `Closes #123` trägt. Als erledigt gilt es
auch, wenn ein gemergter PR desselben Repositories darauf verweist oder ein Commit auf `main` die
Nummer als `#123` oder `owner/repo#123` dieses Repositories nennt. Ein Commit auf einem Feature-Branch
genügt nicht, ebenso wenig ein Verweis auf ein fremdes Repository, ein URL-Anker oder eine Hex-Farbe
wie `#123abc`. Ist keine Codeänderung nötig, wird es
als „Not planned“ beziehungsweise „Duplicate“ geschlossen und trägt einen Abschlussgrund wie oben. Bei
„Close as duplicate“ in der GitHub-Oberfläche gilt das dort ausgewählte Original als Verweis.

Ein Epic (`type: epic`) gilt als erledigt, wenn alle seine Sub-Issues geschlossen sind. Ein Epic ohne
Sub-Issues ist ein gewöhnliches Issue und braucht einen Code-Beleg oder einen Abschlussgrund.

Erkannte Verweisformen sind `Superseded by`, `Replaced by`, `Duplicate of`, `Ersetzt durch`,
`Abgelöst durch`, `Duplikat von` und `Nachfolger:`, jeweils gefolgt von `#123`, `owner/repo#123` oder
einem vollständigen Link wie `https://github.com/owner/repo/pull/123`.

## Wann der Guard läuft

- bei `closed`, `reopened`, `labeled` und `unlabeled` an Issues und PRs, für Label-Events nur bei den
  Labels oben;
- nach dem Schließen erst nach einer Karenzzeit von zwei Minuten, damit ein unmittelbar danach gesetztes
  Label nicht zum Wiederöffnen führt;
- stündlich als Sweep über alle offenen Pflicht-Issues, alle Elemente mit `hygiene:violation` und alle
  in den letzten drei Tagen geschlossenen Elemente, als Netz für verpasste Events.

Schlägt die Auswertung eines einzelnen Elements fehl, etwa weil eine API nicht antwortet, überspringt
der Sweep dieses Element vor jeder Änderung und läuft für die übrigen weiter; der Workflow-Lauf endet
dann rot. Ein unvollständig ausgewertetes Element wird so nie wiedergeöffnet.

Label-Events melden keine neue Pflicht-Lücke, sondern räumen nur eine behobene ab: Das Zwischenstadium
„`prio: must` gesetzt, Stream noch nicht“ wäre sonst ein Fehlalarm. Neue Lücken meldet der Sweep.

## Ausnahmen und Altbestand

- Issues mit einem Label `control:*` sind ausgenommen. Ein CONTROL-Rollover schließt den Vorgänger,
  nachdem er `control:archived` erhalten hat.
- Elemente, die vor der Aktivierung am 2026-10-02 geschlossen wurden, sind Altbestand und werden nicht
  rückwirkend wiedergeöffnet.

## PLAN und Worker

PLAN prüft in jedem Lauf `is:open label:"hygiene:violation"` und behandelt diese Elemente vor neuer
Dispatch-Arbeit: zuweisen, parken oder korrekt abschließen. Ein Worker, der einen PR ohne Merge
schließt oder ein Issue ohne Code abschließt, setzt den Abschlussgrund selbst und vorher.

## Lokal prüfen

Ohne `--apply` läuft der Guard trocken und gibt nur aus, was er täte:

```sh
GITHUB_REPOSITORY=dimto13/ai-tutor-lab GITHUB_TOKEN=<token> \
  node scripts/tracker-hygiene.mjs --sweep --main-ref origin/main
```

Hinter einem HTTPS-Proxy zusätzlich `NODE_USE_ENV_PROXY=1` setzen.
