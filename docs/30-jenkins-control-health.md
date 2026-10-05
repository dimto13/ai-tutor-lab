# Jenkins-Control-Health

`80_AI_TUTOR_CONTROL_HEALTH` ergänzt PLAN mit wiederholbarer, lesender Evidence. PLAN bleibt der
Dispatcher; der Job entscheidet weder über neue Arbeit noch über Reviews, Merges oder Deployments.

## Ausführung

Jenkins auf dem NAS (`192.168.178.81:8083`, Container `jenkins_server_build`) startet alle 20 Minuten
(`H/20 * * * *`) per bestehendem SSH-Alias `msi` den lokalen Benutzer `tobi`. Der Entwicklungsrechner
muss eingeschaltet und erreichbar sein. Die GitHub-Anmeldung und der Git-SSH-Schlüssel stammen aus
diesem Benutzerkontext, nicht aus einer interaktiven Shell oder aus dem Job-Quelltext.

Die Job-Konfiguration wird gemäß Jenkins-Betriebskonvention in SVN versioniert. Das ausführbare
Prüfskript und der fachliche Vertrag bleiben in `dimto13/ai-tutor-lab`. Der Job lädt das Skript aus dem
live ermittelten `main`-Commit über GitHub und führt genau diesen Stand aus; lokale Feature-Änderungen
am Skript werden dadurch nicht unbeabsichtigt zum Scheduler-Vertrag.

Die kanonische Konfiguration erzeugt `node scripts/jenkins-control-health-config.mjs` auf stdout;
keine Konfigurations-Backups werden angelegt. Nur zur ersten Scheduler-Abnahme darf als Argument ein
exakter getesteter Feature-SHA angegeben werden. Er erscheint im Parameter `HEALTH_SCRIPT_REF` und
im Buildlog. Nach Integration wird die Konfiguration mit dem Standard `main` neu erzeugt, zuerst in
SVN committed und anschließend über die Jenkins-API aktualisiert.

Der Checkout liegt unter `/media/tobi/crucial/ssd/skripte/ai-tutor-lab`. Der Job setzt explizit:

```sh
export PATH=/home/tobi/.local/share/ai-tutor-toolchain/node_modules/.bin:/usr/local/bin:/usr/bin:/bin
```

Diese isolierte Toolchain enthält Node `22.23.2` und npm `10.9.8`; die allgemeine Systeminstallation
kann davon abweichen. `npm run worker:doctor` prüft Lese-/Schreibzugriff, Toolchain, Hook und Prettier,
ohne einen Remote-Ref anzulegen. Ein erfolgreicher Doctor beweist verfügbare Voraussetzungen, noch
keinen aktiven implementierenden Agenten.

## Evidence und Fehler

`node scripts/control-health.mjs` liefert ein JSON-Dokument mit dynamisch gefundenem CONTROL,
aktuellen Refs, exakter Main-Push-CI samt aktuellem Versuch und allen Pflichtjobs, Pflicht-Zuweisungen,
Hygiene-Verstößen sowie offenen PRs mit Head, Abstand zu Main und Checks.

| Exitcode | Bedeutung                                                                                  |
| -------- | ------------------------------------------------------------------------------------------ |
| 0        | Prüfung vollständig; Main-Gate und Tracker-Zuweisungen grün                                |
| 1        | Prüfung nicht möglich oder inkonsistenter Snapshot, zum Beispiel SSH/API/CONTROL-Discovery |
| 2        | Prüfung vollständig; Projekt-Gate geschlossen, etwa laufende Main-CI oder Tracker-Verstoß  |

Ein Projektblocker und eine Monitoring-Lücke sind unterschiedliche Befunde. Der Jenkins-Konsolenlog
enthält die Doctor-Ausgabe, den geprüften Skript-SHA und das JSON. Laufende Main-CI erzeugt keine
falsche grüne Evidence. PR-Findings und Review-Threads werden weiterhin durch PLAN vollständig
geprüft; die Check-Liste im Report allein ist keine Merge-Freigabe. Es werden keine E-Mails oder
wiederholten WAIT-Kommentare erzeugt.

Status: <http://192.168.178.81:8083/job/80_AI_TUTOR_CONTROL_HEALTH/>; Projekt-View:
<http://192.168.178.81:8083/view/80_AI_TUTOR_LAB/>. Der erwartete gesunde Nachweis ist ein tatsächlich
vom Timer gestarteter erfolgreicher Build, nicht nur eine manuelle Ausführung.

Bei SSH-Ausfall kann die Diagnose auf dem Entwicklungsrechner direkt ausgeführt werden:

```sh
export PATH=/home/tobi/.local/share/ai-tutor-toolchain/node_modules/.bin:$PATH
npm run worker:doctor
node scripts/control-health.mjs
```

Der direkte Lauf repariert die Jenkins-Verbindung nicht und ersetzt keinen Scheduler-Nachweis.
