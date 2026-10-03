# Worker-Git-Pfad

Dieses Dokument beschreibt den ausführbaren, bewachten Git-Pfad, mit dem Implementierungs-Worker
(CHAT1, CHAT2, CHAT3) Arbeit vom Checkout bis zum veröffentlichten Branch bringen. Der Pfad ist die
ausführbare Form der verbindlichen Regeln aus [`../AGENTS.md`](../AGENTS.md); er ersetzt keine Regel,
sondern macht sie bedienbar.

## Warum als Werkzeug und nicht als Anleitung

Eine Worker-Session, die Fetch, Rebase, Lease-Push und Preservation-Prüfung jeden Lauf aus einzelnen
Git-Aufrufen neu zusammensetzt, hat in jedem Lauf dieselben Gelegenheiten: den Rebase überspringen,
statt `--force-with-lease` blind forcen, den Commit eines parallel arbeitenden Workers überschreiben
oder auf `main` beziehungsweise `deploy` landen. Der Pfad nimmt diese Gelegenheiten weg und nennt bei
jedem Abbruch den nächsten exakten Befehl.

## Voraussetzungen

```sh
npm run worker:doctor
```

`doctor` verändert nichts und prüft genau die Voraussetzungen, an denen der Pfad sonst mitten im Lauf
scheitert:

| Prüfung                      | Warum sie zählt                                                           |
| ---------------------------- | ------------------------------------------------------------------------- |
| Git-Arbeitsbaum und `origin` | Ohne echten Checkout gibt es keinen Branch, keinen Test und kein Push     |
| Lesezugriff auf `origin`     | Der Integrationsstand muss live lesbar sein, nicht aus dem Gedächtnis     |
| Schreibzugriff auf `origin`  | Push-Dry-Run auf einen Probe-Ref; legt nichts an und wird nachgesehen     |
| Node entspricht `.nvmrc`     | Mit der falschen Node-Version scheitert bereits das erste Gate            |
| Toolchain-Vertrag            | Ruft die vorhandene Runtime-Prüfung des Repositories auf                  |
| Commit-Hook und Prettier     | Ohne aktiven Hook entstehen unformatierte Commits, die erst die CI meldet |

Fehlt eine Voraussetzung, endet `doctor` mit Exit-Code 1 und nennt den Behebungsschritt, bei der
Node-Version zum Beispiel den konkreten `PATH`-Export.

## Durchlauf

```sh
npm run worker:doctor                              # Voraussetzungen prüfen
npm run worker:start -- chat1/<issue>-<kurzname>   # Branch auf aktueller origin/main-Spitze
# implementieren und committen
npm run check                                      # nach der letzten inhaltlichen Änderung
npm run worker:sync                                # Rebase auf den dann aktuellen origin/main
npm run check                                      # frische Gates auf dem rebasierten Head
npm run worker:push                                # veröffentlichen, Force nur mit Lease
npm run worker:gate                                # lokal prüfbare Merge-Voraussetzungen
```

Argumente und Optionen werden hinter `--` übergeben, damit npm sie an das Werkzeug weiterreicht.

## Was die Befehle garantieren

- `start <branch>` legt den Branch auf der frisch geholten `origin/main`-Spitze an und verweigert
  geschützte Refs, Namen ohne Präfix, ungültige Ref-Namen und bereits existierende Branches.
- `sync` rebasiert den aktuellen Feature-Branch auf `origin/main` und bestätigt danach `behind_by == 0`.
  Ein Merge von `main` in den Branch ist ausdrücklich kein Ersatz und findet hier nicht statt.
- `push` liest den Remote-Head live, vergleicht die fremden Commits per Patch-Identität und pusht
  ausschließlich mit `--force-with-lease=<ref>:<erwarteter Stand>`. Danach wird der veröffentlichte
  Stand erneut live nachgesehen.
- `gate` ändert nichts und prüft Feature-Branch, sauberen Arbeitsbaum, keinen unterbrochenen
  Git-Vorgang, `behind_by == 0`, Gleichstand von lokalem und Remote-Head sowie Preservation. Eine
  fachlich gewollte Löschung wird mit `--allow-deletions` quittiert, genau wie bei `sync` — ein
  Gate, das ein aufräumender PR nicht bestehen kann, wird umgangen statt beachtet.

## Bewachte Grenzen

- `main` und `deploy` werden nicht rebasiert, nicht gepusht und nicht als Arbeitsbranch akzeptiert.
- Ein blindes `--force` existiert im Pfad nicht; ein Test sichert das ab.
- Commits, deren Änderung auf dem Remote liegt und lokal fehlt, werden nicht stillschweigend
  verworfen. Der Pfad nennt sie und verlangt eine bewusste Quittierung mit `--allow-drop`.
  Ausgenommen sind eigene Vorfassungen nach einem Rebase; siehe
  [Eigene Vorfassung oder fremder Commit](#eigene-vorfassung-oder-fremder-commit).
- Verschwinden gegenüber `main` in `.github/workflows/`, `.githooks/`, `tests/`, `scripts/`, `docs/`,
  `AGENTS.md` oder `CLAUDE.md` blockiert. Eine fachlich gewollte Löschung wird mit
  `--allow-deletions` quittiert.
- Ein unterbrochener Rebase, Merge, Cherry-Pick oder Revert blockiert, bis er aufgelöst oder
  verworfen ist.
- Ein Arbeitsbaum mit nicht eingecheckten Änderungen blockiert Rebase und Push: gepusht wird nur,
  was auch getestet wurde.

## Eigene Vorfassung oder fremder Commit

`push` vergleicht die Commits auf `origin/<branch>` per Patch-Identität (`git cherry`) mit dem lokalen
Head. Nach einem konfliktfreien Rebase sind die Patches der eigenen Commits unverändert, nur ihre SHAs
sind neu. Bei einem Rebase **mit Konfliktauflösung** ändert sich dagegen der Patch des eigenen
Commits, genau dafür löst man den Konflikt auf. Die bereits veröffentlichte Fassung sähe dann wie
fremde Arbeit aus, und das im Normalfall des verpflichtenden Rebase vor dem Merge.

Ein Remote-Commit, dessen Patch lokal fehlt, gilt deshalb nur dann als **eigene Vorfassung**, wenn
beides zutrifft:

1. Dieser Checkout hatte ihn selbst auf dem Branch, belegt durch das Reflog von
   `refs/heads/<branch>`.
2. Lokal liegt ein noch nicht veröffentlichter Commit mit gleichem Autor und Betreff, der ihn ersetzt.

Eigene Vorfassungen blockieren nicht; `push` weist sie als „ersetzt (eigene Vorfassung nach Rebase)“
aus. Alles andere bleibt blockierend und wird mit Kurz-SHA, Autor und Betreff benannt:

- Was ein anderer Worker gepusht hat, war nie im lokalen Branch, auch wenn Autor und Betreff gleich
  sind. Alle Worker committen unter derselben Identität, und der Format-Autofix erzeugt immer wieder
  denselben Betreff `chore: apply canonical formatting`. Autor oder Betreff allein trennen also nichts.
- Ein Commit, den dieser Checkout hatte und ohne Nachfolger verloren hat, etwa nach
  `git reset --hard`, ist kein Rebase, sondern ein Verlust.
- Ohne Reflog, etwa in einem frisch geklonten Checkout, der den Branch nie selbst hatte, gilt jeder
  fehlende Commit als fremd. Der Schutz fällt im Zweifel auf Blockieren zurück.

Wurde beim Auflösen auch der Betreff geändert, greift Bedingung 2 nicht. Dann ist `--allow-drop`
nach eigener Prüfung mit `git log --oneline HEAD..origin/<branch>` der vorgesehene Weg.

## Was der Pfad nicht beweist

`gate` prüft den Git-Stand, nicht die Freigabe. Unverändert verbindlich und außerhalb dieses
Werkzeugs zu belegen bleiben:

- vollständige frische Exact-Head-CI auf dem rebasierten Head,
- Disposition aller Review-Findings,
- die global serielle Merge-Lane und die grüne `push`-CI auf dem entstandenen `main`,
- jede Cloud-, Browser- oder Deployment-Evidence; `deploy` bleibt Owner-only.

## Konflikte

Ein Rebase-Konflikt beendet `sync` mit Exit-Code 1 und lässt den Rebase bewusst stehen. Danach gilt:
Konflikte auflösen, `git add`, `git rebase --continue`, anschließend `npm run worker:sync` erneut.
Verworfen wird mit `git rebase --abort`.

Die Befehle hängen am erkannten Vorgang: bei einem unterbrochenen Merge, Cherry-Pick oder Revert
nennt der Pfad `git merge --abort`, `git cherry-pick --abort` beziehungsweise `git revert --abort`.
Ein Rebase-Befehl würde dort in `fatal: No rebase in progress?` enden. Bereits auf `main` erledigte Arbeit, Guards, Tests und
Workflows dürfen dabei nicht regressieren.
