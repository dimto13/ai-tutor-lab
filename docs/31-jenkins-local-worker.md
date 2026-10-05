# Jenkins→RMI External Executor

`80_AI_TUTOR_IMPLEMENTATION_WORKER` führt ausschließlich explizite PLAN-Aufträge aus dem dynamisch
entdeckten ACTIVE CONTROL aus. Kanonischer Vertrag: [24-control-plane.md](24-control-plane.md).
Kein Work-Stealing, kein automatischer Merge, kein deploy. API-Chats bleiben Planer/Dispatcher.

## Sichtbarer Ausführungspfad

Jenkins-Container auf dem NAS → vorhandenes SSH-Ziel `rmi`, Benutzer `tobi` → isolierter Checkout
und dediziertes Docker-Build-Image auf RMI. Keine Ausführung auf `msi`, keine neue Jenkins-Agent-
Registrierung, keine Änderung von `.bashrc`, globaler Codex-Konfiguration, AppArmor oder sysctl.

Alle projektbezogenen Pfade liegen sichtbar unter `/home/tobi/skripte/ai-tutor-lab-jenkins/`:

| Pfad                                         | Zweck                                                           |
| -------------------------------------------- | --------------------------------------------------------------- |
| `source/<exact-sha>/`                        | veröffentlichte Runner/Quota/Dispatch-Skripte desselben Git-SHA |
| `toolchain/node_modules/.bin/`               | Node 22.23.2 und npm 10.9.8, keine globale Installation         |
| `workspaces/checkout-<issue>-<branch-hash>/` | eigener persistenter Feature-Branch-Checkout                    |
| `state/project.lock`                         | projektweite Sperre zusätzlich zu Jenkins non-concurrent        |
| `state/quota-<provider>.json`                | Tages-Skip / Quota-Snapshot, keine Auth-Tokens                  |
| `state/issue-<issue>.json`                   | Request-Identität, PR, Ergebnis und Fehler-Deduplizierung       |
| `state/run-<issue>-<timestamp>/`             | private Runner-/Container-/Modell-Logs und Ausgabe              |

State/Logs sind 0700/0600 auf dem RMI-POSIX-Dateisystem. Alte `msi`-Checkouts/Logs bleiben als historische
Evidence erhalten, werden nicht verwendet und nicht gelöscht. Modell und Reasoning stehen explizit
in Jenkins: derzeit `gpt-5.6-sol` / `xhigh`, entsprechend der vorgefundenen RMI-Wahl.

## Einrichtung und Laufarten

`node scripts/jenkins-local-worker-config.mjs [main|exact-sha]` erzeugt kanonisches XML auf stdout.
SVN-Commit vor Jenkins-API-Publishing, keine XML-Kopien/Backups. Timer `H/20 * * * *`, non-concurrent,
RMI-`flock`, maximal 50 Minuten SSH, 48 Minuten Runner, 30 Minuten Modell. Ein Feature-SHA ist nur für
die gestufte Abnahme gepinnt; Normalbetrieb folgt erst nach grüner Integration `main`.

`WORKER_ACTION`:

- `setup`: ausdrücklich gestartete einmalige Jenkins-Einrichtung von Node/npm und Docker-Image. Kein
  Modell-/Coding-Lauf. Führt `scripts/jenkins-rmi-setup.sh` aus; niemals Timer-Standard. Dockerfile:
  `scripts/jenkins-rmi-worker.Dockerfile` mit Node 22.23.2, npm 10.9.8 und Codex 0.160.0.
- `execute` (Timer-Standard): Quota prüfen, danach höchstens den expliziten PLAN-Auftrag ausführen.
- `quota`: Quota und CONTROL-Status aktualisieren, niemals Coding/Checkout/Tests.
- `plan`: nur lesende Discovery-/Dispatch-/Scope-Prüfung; kein Modell und keine CONTROL-Mutation.

`WORKER_PROVIDER=codex` nutzt die vorhandene RMI-ChatGPT-Anmeldung. Claude ist dort nicht installiert
und hat noch keinen belastbaren Quota-Adapter: `claude` bleibt UNKNOWN/SKIP, kein automatischer Wechsel.
Keine automatische Quota-Reset-Nutzung, keine zusätzlichen API-Kosten oder Credits.

## Quota vor Arbeit

Codex App Server `account/rateLimits/read` wird ohne Thread/Turn/Modellstart aufgerufen. Das Minimum
von `100 - usedPercent` aller gelieferten Fenster/Buckets muss mindestens 50 sein. Fehlende, abgelaufene
oder ungültige Daten erlauben keinen Start. Details: [offizielle OpenAI Docs](https://learn.chatgpt.com/docs/app-server).

Unter 50: für den restlichen Berlin-Kalendertag `SKIPPED_QUOTA`; unbekannt: mindestens 15 Minuten
Retry-Abstand. Ein Skip endet vor Clone, npm-Installation, Tests, Docker oder Modell. CONTROL bekommt
einen idempotenten `executor-quota:v1`-Status im Body, keine wiederholten Kommentare. Am nächsten Tag
wird frisch geprüft. Positive Quota wird vor Modellstart erneut abgefragt, lange Läufe minütlich;
bei Unterschreitung wird gestoppt, ohne Commit/Push und unter Erhalt der Arbeit. Bereits laufende
Requests/gerundete Providerzahlen verhindern einen token-genauen Deckel.

## Container- und Git-Grenze

Nur das dedizierte Worker-Image verwendet `codex --sandbox danger-full-access`, weil Docker die äußere
Ausführungsgrenze stellt. **Nicht** auf dem RMI-Host oder im Jenkins-Controller. Der Container ist
non-root, Root-FS read-only, Capabilities entfernt, `no-new-privileges`, 4 GiB / 2 CPU / 256 PIDs.
Checkout ist schreibbar, `.git` read-only. Nur die einzelne Auth-Datei und der Browser-Cache werden
read-only eingebunden; keine SSH-/GitHub-Credentials, kein Jenkins-Home, kein Docker-Socket. Modell-
Ausgabe hat einen eigenen Ordner; Runner-Logs und CONTROL-State sind nicht eingebunden.
Docker-Netzwerk erlaubt Providerzugriff und ist nicht domain-gefiltert. Die Auth-Datei bleibt im
Container lesbar; kein vollständiger Schutz gegen bösartige Repository-Inhalte wird behauptet.
Siehe [OpenAI zur äußeren Containergrenze](https://learn.chatgpt.com/docs/agent-approvals-security).

Vor Modellstart wird Lesen/Schreiben im Checkout und Schreibschutz von `.git` real geprüft, ohne
Modellaufruf. Nach Abbruch/Timeout wird ausschließlich der eindeutig benannte eigene Run-Container
entfernt; Checkout und Ausgabe bleiben erhalten. Unbestätigte Container-Bereinigung ist ein Fehler.

Der Host-Runner prüft Branch/Head/Scope und Auftrag erneut, führt den bewachten `worker:*`-Pfad und
vollständiges `npm run check` nach der letzten Änderung/Rebase aus, pusht mit Lease und erzeugt einen
PREPARED PR. TEST und REBASE brauchen keinen Modelllauf. Derselbe erledigte oder gescheiterte Request
wird nicht erneut ausgeführt. Ein Fehlerhalt bleibt auch bei fehlgeschlagenem GitHub-Handoff persistent;
der erste Fehler ist in Jenkins sichtbar. PLAN muss nach Ursachenklärung einen geänderten Auftrag
freigeben, vorzugsweise mit neuem `token`. Checkouts sind zusätzlich nach Branch getrennt; für Arbeit
an einer bestehenden PR wird deren Branch ausdrücklich wiederverwendet. CI-/Review-Reparaturen brauchen
einen neuen expliziten PLAN-Auftrag; grüne CI allein ist
keine Merge-Freigabe. PLAN prüft alle Integration-/Acceptance-Gates unabhängig.

## Betrieb und Abnahme

Job: <http://192.168.178.81:8083/job/80_AI_TUTOR_IMPLEMENTATION_WORKER/>.
Gesundes Skip-Signal: echte Jenkins-Konsole zeigt `host:rmi`, `SKIPPED_QUOTA`, aktuelle Quota-Zeit und
keinen Modell-/Checkout-Start. Es bedeutet **nicht** erfolgreiche Implementierung.

Recovery: nach Quota-Freigabe zuerst `WORKER_ACTION=quota`, danach PLAN-Auftrag validieren und
`execute`. Bei Toolchain/Image-Problemen gezielt `setup` verwenden. Fehlende SSH/Auth/CONTROL-Daten
sind Fehler, nicht Leerlauf. Reale Timer-Abnahme und erfolgreicher Coding-/Test-/PR-Lauf müssen
separat belegt werden; Quota-Skip oder manuelle Tests ersetzen diesen Implementierungsnachweis nicht.
