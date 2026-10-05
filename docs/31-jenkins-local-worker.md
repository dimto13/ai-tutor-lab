# Autonomer lokaler Jenkins-Executor

`80_AI_TUTOR_IMPLEMENTATION_WORKER` ergänzt die API-Chats um tatsächlich ausführbare Codearbeit.
Der Owner hat den autonomen lokalen Betrieb am 2026-10-05 ausdrücklich freigegeben. PLAN bleibt
Dispatcher; der Executor implementiert ausschließlich einen expliziten Auftrag im dynamisch
entdeckten ACTIVE CONTROL. Er wählt keine fremden Aufgaben und mergt/deployt niemals automatisch.

## Dispatch-Vertrag

CONTROL kann genau einen HTML-Kommentar `jenkins-local-dispatch:v1` enthalten. Sein JSON enthält
`schemaVersion: 1`, `enabled: true`, einen eindeutigen `token`, die positive `issue`-Nummer,
`branch: owner/<issue>-<kurzname>` und eine Liste `allowedPaths`. Das Issue muss offen sein und genau
`stream:owner` als Zuweisung tragen. Neue Aufgaben werden durch PLAN ausdrücklich freigegeben;
`enabled: false` oder kein Block bedeutet gesunden Leerlauf, nicht Work-Stealing.

Zugelassen sind explizite Anwendungs-/Package-/Testpfade. Infrastruktur, Agentenregeln, Hooks,
Workflows und Runner-Code sind nicht an den Coding-Worker delegiert. Kollisionen mit offenen PRs
blockieren. Die Zuweisung wird unmittelbar vor Commit/Push erneut gelesen; Änderung oder Rollover
verhindert die Veröffentlichung und erhält die lokale Arbeit.

## Tatsächlicher Ausführungspfad

Jenkins NAS → SSH-Alias `msi` / Benutzer `tobi` → persistenter Laufzeitordner
`/media/tobi/crucial/ssd/skripte/ai-tutor-lab-workers/runtime`. Der Rechner muss eingeschaltet und
erreichbar sein. Ein SSH-Ausfall ist ein sichtbarer Jobfehler, kein erfolgreich geprüfter Leerlauf.

Der Timer läuft `H/20 * * * *`. Jenkins verbietet konkurrierende Builds; zusätzlich hält die
SSH-Ausführung einen projektweiten `flock`. Ein isolierter GitHub-Clone pro Issue verhindert, dass
eine Benutzer-Worktree oder die Implementierung des Executors überschrieben wird. Toolchain-PATH:
`/home/tobi/.local/share/ai-tutor-toolchain/node_modules/.bin:/usr/local/bin:/usr/bin:/bin`.

Codex nutzt die vorhandene ChatGPT-Anmeldung des lokalen Benutzers und dessen Modell-/Reasoning-Wahl,
aber keine sonstigen Konfigurations-Hooks oder MCP/App-Verbindungen. Die Invocation erzwingt
`workspace-write`, `approval_policy=never`, abgeschaltetes Netzwerk und deaktivierte Apps/Hooks.
Der Modelllauf ist auf 30 Minuten, der Remote-Runner auf 48 und Jenkins-SSH auf 50 Minuten begrenzt.
Git-Mutationen des Modells sind verboten; Branch/Head und Dateiscope werden danach überprüft.

Vor einem Modelllauf prüft `codex sandbox` echtes Lesen/Schreiben im Checkout und Schreibschutz
für `.git`. Eine nicht startfähige Sandbox ist BLOCKED, verbraucht keinen weiteren Modelllauf
und wird niemals durch `danger-full-access` oder eine globale Abschaltung von AppArmor umgangen.

Der Runner führt `worker:doctor/start/sync/push/gate`, vollständiges `npm run check`, kanonischen
Commit und PR-Veröffentlichung aus. Nach Sync/Commit läuft die vollständige Prüfung erneut.
Das Ergebnis ist **PREPARED**, nie automatisch DONE. Fresh Exact-Head-CI, alle Reviews/Threads,
erneuter unmittelbarer Rebase/Git-Gate und serieller Merge samt resultierender Main-CI bleiben Gates.

## Reviews, Fehler und Handoff

Während PR-CI läuft, erfolgt kein neuer Modelllauf. Neue Review-Findings werden in einem Folge-Lauf
klassifiziert/bearbeitet; identische Reviews oder derselbe unveränderte CI-Fehler lösen keine
Endlosschleife aus. Maximal zwei automatische Jenkins-Reviews bleiben der bestehende Vertrag.
PREPARED-/BLOCKED-Handoffs werden ins aktuelle CONTROL geschrieben. Identische lokale Fehler werden
nicht erneut kommentiert; WAIT bleibt still. Rohes Modell-JSONL und Runner-Logs liegen privat
im jeweiligen `run-<issue>-<timestamp>`-Ordner und nicht im Jenkins-Konsolenlog.
State/Logs/Sperre verwenden das POSIX-Dateisystem unter
`/home/tobi/.local/state/ai-tutor-lab-jenkins-worker` (Verzeichnis 0700, Dateien 0600).
Die NTFS/FUSE-Checkout-Platte erzwingt diese Dateimodi nicht; dort liegen deshalb keine privaten
Laufzeitlogs. Der Runner bricht bei fehlendem POSIX-Verzeichnisschutz ab.

## Konfiguration und Abnahme

`node scripts/jenkins-local-worker-config.mjs` liefert kanonisches XML auf stdout. SVN-Commit geht
Jenkins-API-Publishing voraus; keine XML-Backups. `WORKER_SCRIPT_REF=main` ist der Normalbetrieb;
ein exakter getesteter Feature-SHA ist nur für gestufte Erstabnahme zulässig. `WORKER_ACTION=plan`
prüft nur Discovery/Assignment/Scope; `execute` startet Codearbeit, wenn ein fortsetzbarer Auftrag
vorliegt. Der erste echte Timer-/Sandbox-/Code-/PR-Nachweis muss separat dokumentiert werden;
ein erfolgreicher Plan-Lauf beweist noch keinen implementierenden Worker.

Job: <http://192.168.178.81:8083/job/80_AI_TUTOR_IMPLEMENTATION_WORKER/>.
Realer Health-Job: <http://192.168.178.81:8083/job/80_AI_TUTOR_CONTROL_HEALTH/>.
Bei Ausfall: erst Jenkins-Konsole/SSH prüfen; lokal `WORKER_ACTION=plan` über den veröffentlichten
Runner nachstellen. Das ersetzt keine Timer-Abnahme. `deploy` bleibt ausschließlich Owner-only.
