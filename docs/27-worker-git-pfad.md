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
  Git-Vorgang, `behind_by == 0`, Gleichstand von lokalem und Remote-Head sowie Preservation.

## Bewachte Grenzen

- `main` und `deploy` werden nicht rebasiert, nicht gepusht und nicht als Arbeitsbranch akzeptiert.
- Ein blindes `--force` existiert im Pfad nicht; ein Test sichert das ab.
- Commits, deren Änderung auf dem Remote liegt und lokal fehlt, werden nicht stillschweigend
  verworfen. Der Pfad nennt sie und verlangt eine bewusste Quittierung mit `--allow-drop`.
- Verschwinden gegenüber `main` in `.github/workflows/`, `.githooks/`, `tests/`, `scripts/`, `docs/`,
  `AGENTS.md` oder `CLAUDE.md` blockiert. Eine fachlich gewollte Löschung wird mit
  `--allow-deletions` quittiert.
- Ein unterbrochener Rebase, Merge, Cherry-Pick oder Revert blockiert, bis er aufgelöst oder
  verworfen ist.
- Ein Arbeitsbaum mit nicht eingecheckten Änderungen blockiert Rebase und Push: gepusht wird nur,
  was auch getestet wurde.

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
Verworfen wird mit `git rebase --abort`. Bereits auf `main` erledigte Arbeit, Guards, Tests und
Workflows dürfen dabei nicht regressieren.
