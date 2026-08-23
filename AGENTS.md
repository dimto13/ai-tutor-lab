## Projektbetrieb (verbindlich)

- **Single Source of Truth ist ausschließlich das Git-Repository `dimto13/ai-tutor-lab`.**
- Entwicklung, Builds und Tests erfolgen auf dem lokalen Entwicklungsrechner und auf Basis eines
  explizit ausgecheckten Git-Branches.
- Zusammenarbeit und Integration erfolgen über Git/GitHub mit Branches, Commits und Pull Requests.
- **Keine direkten Pushes auf `main`.** Änderungen laufen über einen eigenen Branch und einen
  Pull Request.
- Ziel für Hosting und Deployment ist **AWS Amplify**. AWS beobachtet den Release-Branch `deploy`;
  ein Merge nach `main` löst bewusst noch kein Deployment aus.
- **AWS ist die aktuelle Infrastrukturimplementierung, nicht der Anwendungsvertrag.** Fachliche
  Logik und UI bleiben cloud-neutral. Cloud-SDKs werden ausschließlich hinter definierten Ports
  und Adaptern verwendet. Die verbindliche Boundary steht in
  [`docs/20-cloud-provider-boundary.md`](docs/20-cloud-provider-boundary.md).
- **Lovable war nur für den ersten POC/Bootstrap im Einsatz und ist ab jetzt kein Bestandteil des
  Entwicklungs-, Test-, Preview-, Publishing-, Deployment- oder Synchronisationsprozesses mehr.**
- Lovable-Links, Lovable-Previews oder eine GitHub↔Lovable-Synchronisierung sind kein gültiger Nachweis
  für den aktuellen Projektstand.

## Arbeitsregeln für KI-Agenten in diesem Repository

1. **Vor jeder Aufgabe lesen:** [`prompts/model-briefing.md`](prompts/model-briefing.md)
   (die Architekturregeln), [`docs/24-control-plane.md`](docs/24-control-plane.md)
   (operative CONTROL-Discovery und Rollover) und bei Codearbeit zusätzlich
   [`docs/02-domaenenmodell.md`](docs/02-domaenenmodell.md). Bei Arbeit an `amplify.yml`,
   Amplify-Backend-Code, Auth/Identity, Persistenz, Cloud-SDKs oder Deployment zusätzlich
   [`docs/19-aws-amplify-konventionen.md`](docs/19-aws-amplify-konventionen.md) und
   [`docs/20-cloud-provider-boundary.md`](docs/20-cloud-provider-boundary.md).
2. **Cloud-Neutralität ist eine harte Architekturgrenze.** UI, Routes, State, Training Engine und
   fachliche Modelle verwenden keine Cognito-, Amplify-, Firebase- oder Google-Cloud-Typen als
   Anwendungsvertrag. Sie hängen an eigenen Ports wie `AuthService` und eigenen Modellen wie
   `UserIdentity`. Cloud-spezifische Web-SDK-Imports sind nur in den vorgesehenen Adapterverzeichnissen
   erlaubt; die CI-Architekturtests sichern diese Regel ab. AWS/Cognito ist die erste Implementierung.
   Weitere Provider werden später durch zusätzliche Adapter ergänzt, nicht durch Umbau der UI.
3. **Aufgabenverwaltung läuft ausschließlich über GitHub Issues.** Neue Aufgaben werden direkt
   als Issue angelegt — mit Epic-Label, Prio-Label, Typ-Label und Milestone, und als Sub-Issue
   unter dem passenden Epic. Inhaltliche Änderungen an Tickets gehören in den Issue-Text.
   `backlog/backlog.yaml`, `backlog/tickets.csv` und `docs/06-backlog.md` sind eingefrorenes
   Archiv des ursprünglichen Planungsstands und dürfen nicht mehr gepflegt werden. Das operative
   Implementation-Control ist kein Backlog-Task, sondern die Status-, Queue-, Evidence- und
   Handoff-SSOT. Es wird **nicht über eine Issue-Nummer**, sondern ausschließlich als das genau eine
   offene Issue mit dem Label `control:active` gefunden. Existieren null oder mehrere offene Issues
   mit diesem Label, ist das ein Control-Plane-Blocker; Agenten dürfen dann kein CONTROL erraten.
4. **Keine History-Rewrites und keine Force-Pushes**, sofern dies nicht ausdrücklich und bewusst
   für einen konkreten Git-Vorgang entschieden wurde.
5. Szenarien sind Daten (YAML/JSON), kein Code. Keine CSS-Selektoren, keine
   Herstellernamen in Dateinamen, kein Fortschritt per Weiter-Button.
6. **Nur Grünes nach `main` — einschließlich der nachgelagerten `push`-CI.** `npm run check` läuft nach
   der letzten inhaltlichen Änderung eines Branches, nicht davor. Ein Pull Request wird erst gemergt,
   wenn die konfigurierten PR-Jobs vollständig grün sind; ein noch laufender Workflow ist kein grüner
   Workflow. Nach dem Merge bleibt der Block beim mergenden Stream, bis die `push`-CI auf dem daraus
   entstandenen `main` vollständig grün ist. Solange diese Main-CI läuft, wird kein weiterer PR gemergt.
   Eine rote Main-CI ist ein aktiver Blocker und wird vor dem nächsten Queue-Punkt repariert oder durch
   CONTROL explizit einem querschnittlichen Quality-Block zugewiesen. Der Pre-Commit-Hook in `.githooks/`
   fängt Formatverstöße bereits beim Commit ab; er wird durch `npm ci` automatisch aktiviert.
7. **Automatische und menschliche Reviews sind Merge-Gates, nicht nur Information.** Vor jedem Merge
   werden alle PR-Reviews und PR-Kommentare seit der letzten relevanten Codeänderung geprüft. Das gilt
   ausdrücklich für das Jenkins-Review mit Marker `[agy-review]`, weitere Review-Bots und menschliche
   Reviewer. Findings werden in `actionable`, `advisory` oder `nicht zutreffend` eingeordnet.
   Actionable Findings werden vor dem Merge umgesetzt oder mit einer konkreten technischen Begründung
   bewusst verworfen; die Einordnung und Entscheidung wird als PR-Kommentar oder direkt im zugehörigen
   Review-Thread dokumentiert. Ein grüner CI-Lauf ersetzt diese Prüfung nicht. Review-Vorschläge werden
   nicht blind umgesetzt: Architekturgrenzen, Sicherheit, Tests und fachliche Anforderungen haben
   Vorrang. Jenkins liefert pro PR höchstens zwei automatische Review-Runden. Nach einem
   Review-Folgecommit werden CI und — sofern die zweite Runde noch verfügbar ist — das neue
   `[agy-review]` geprüft; eine dritte automatische Review-Runde wird weder erwartet noch zum Merge-Gate.
   Ist Jenkins nicht verfügbar oder quittiert nach seinem konfigurierten Timeout ohne weiteres Review,
   darf nach dokumentierter manueller Prüfung weitergearbeitet werden; bereits vorhandene Findings
   bleiben trotzdem vollständig zu behandeln. Vor dem Merge darf kein unbehandeltes actionable Finding
   und kein unresolved/requested-change-Review verbleiben. `auto-reviewed` plus vollständig grüne Gates
   und keine actionable Findings erlaubt Self-Merge ohne zusätzlichen Owner-Review-Wartepunkt.
8. **Lovable nicht verwenden** — weder für Codeänderungen noch für Preview, Publishing, Deployment,
   Synchronisation oder Fehlersuche.
9. **Keine temporären GitHub-Actions-Workflows für Implementierungsarbeit.** Dateien unter
   `.github/workflows/` dürfen nicht als einmalige Implementierungs-, Patch-, Formatter- oder
   Migrations-Runner angelegt werden. Solche Arbeiten erfolgen lokal auf dem Feature-Branch mit den
   dafür vorgesehenen Projektwerkzeugen. Neue oder geänderte Workflows müssen eine dauerhafte
   Repository-Funktion haben und Bestandteil des eigentlichen Review-Scopes sein.
10. **Session- und Kontextmanagement erfolgt über das dynamisch entdeckte ACTIVE CONTROL.** Eine neue
    Session darf sich nicht ausschließlich auf Chat-Historie oder Modellgedächtnis verlassen. Sie findet
    zuerst das genau eine offene `control:active`-Issue und prüft danach mindestens live `main`, `deploy`,
    offene PRs, PR-CI/Reviews, die letzte verfügbare `push`-CI auf `main` sowie den eigenen
    Queue-/Handoff-Stand. Ab ungefähr 50 Minuten aktiver Session wird kein neuer großer Queue-Punkt
    begonnen; bis ungefähr 60 Minuten wird ein sicherer Commit/PR/CI-Zustand hergestellt und ein
    präziser Handoff im aktuell aktiven CONTROL hinterlegt. Ein Session-Cut ist kein fachlicher STOP;
    die nächste Session übernimmt aus Git + CONTROL.
11. **`deploy` ist ausschließlich Release-Zeiger.** KI-Agenten entwickeln nicht auf `deploy`, mergen
    nicht nach `deploy` und verschieben diesen Ref nicht. Ausschließlich der Repository-Eigentümer führt
    die bewusste Deployment-Freigabe aus. Ein `deploy`-SHA gilt erst nach commit-spezifisch erfolgreichem
    Amplify-Deployment, frischer Cloud Acceptance und anschließender Cloud User Acceptance als real-cloud
    validiert; Git-Zeiger oder ältere Evidence ersetzen diese Kette nicht.
12. **`APPSYNC_JS` ist ein eingeschränktes Runtime-Subset.** Produktive AppSync Resolver/Functions müssen
    die vorhandenen runtime-spezifischen Lint-/Validation-Gates bestehen; normale Node-/Browser-JS-
    Kompatibilität genügt nicht. Nicht validierte Globals/Typkonverter, Funktionsreferenzen oder andere
    Higher-Order-Muster dürfen nicht allein aufgrund allgemeiner JavaScript-Gültigkeit eingeführt werden.
13. **CONTROL-Rollover ist issue-nummernunabhängig.** Ein Nachfolger wird vollständig vorbereitet, dann
    mit `control:active` aktiviert; das Label wird unmittelbar vom Vorgänger entfernt und der Vorgänger
    archiviert/geschlossen. Ein kurzzeitiger Zustand mit null oder mehreren aktiven CONTROL-Issues muss
    fail-closed behandelt werden. Repository-Dokumente, CI und Scheduler dürfen keine konkrete
    CONTROL-Issue-Nummer als dauerhaften Vertrag hardcodieren.
