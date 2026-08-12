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
   (die Architekturregeln) und bei Codearbeit zusätzlich
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
   Archiv des ursprünglichen Planungsstands und dürfen nicht mehr gepflegt werden. Das dauerhafte
   Implementation-Control-Issue #201 ist davon bewusst ausgenommen: Es ist kein Backlog-Task,
   sondern ein operatives Status- und Handoff-Artefakt und bleibt deshalb ohne Milestone offen.
4. **Keine History-Rewrites und keine Force-Pushes**, sofern dies nicht ausdrücklich und bewusst
   für einen konkreten Git-Vorgang entschieden wurde.
5. Szenarien sind Daten (YAML/JSON), kein Code. Keine CSS-Selektoren, keine
   Herstellernamen in Dateinamen, kein Fortschritt per Weiter-Button.
6. **Nur Grünes nach `main`.** `npm run check` läuft nach der letzten inhaltlichen Änderung
   eines Branches, nicht davor. Ein Pull Request wird erst gemergt, wenn die Jobs `validate`
   **und** `e2e-training-modes` abgeschlossen und grün sind — ein noch laufender Workflow ist
   kein grüner Workflow. Der Pre-Commit-Hook in `.githooks/` fängt Formatverstöße bereits beim
   Commit ab; er wird durch `npm ci` automatisch aktiviert.
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
   und kein unresolved/requested-change-Review verbleiben.
8. **Lovable nicht verwenden** — weder für Codeänderungen noch für Preview, Publishing, Deployment,
   Synchronisation oder Fehlersuche.
9. **Keine temporären GitHub-Actions-Workflows für Implementierungsarbeit.** Dateien unter
   `.github/workflows/` dürfen nicht als einmalige Implementierungs-, Patch-, Formatter- oder
   Migrations-Runner angelegt werden. Solche Arbeiten erfolgen lokal auf dem Feature-Branch mit den
   dafür vorgesehenen Projektwerkzeugen. Neue oder geänderte Workflows müssen eine dauerhafte
   Repository-Funktion haben und Bestandteil des eigentlichen Review-Scopes sein.
10. **Session- und Kontextmanagement über #201.** Bei längeren Implementierungsläufen wird der
    operative Stand im Implementation-Control-Issue #201 gepflegt. Eine neue Session darf sich nicht
    ausschließlich auf Chat-Historie oder Modellgedächtnis verlassen, sondern prüft mindestens den
    aktuellen `main`-SHA, #201 inklusive letztem Handoff, die Issues des nächsten Arbeitsblocks sowie
    relevante offene PRs/CI-Läufe. Ein Session-Cut erfolgt bevorzugt an natürlichen Grenzen
    (abgeschlossener Architekturblock, ungefähr 2–4 Issues/PRs, grüner Merge vor Themenwechsel oder
    früher bei hoher Kontextlast). Vor dem Cut wird in #201 ein Handoff mit Start-/End-SHA,
    abgeschlossenen Arbeiten, Architekturentscheidungen, offenen Risiken und dem exakten nächsten
    Arbeitsschritt hinterlegt. Die Session-Health-Werte `FRESH`, `ACTIVE`, `CUT-SOON` und `CUT` sind
    qualitative Arbeitsmetriken und keine behauptete exakte Tokenmessung.
11. **`deploy` ist ausschließlich Release-Zeiger.** KI-Agenten entwickeln nicht auf `deploy`, mergen
    nicht nach `deploy` und verschieben diesen Ref nicht. Nach einem vollständig grünen Merge nach
    `main` führt ausschließlich der Repository-Eigentümer die bewusste Deployment-Freigabe mit
    `git push origin main:deploy` aus. Erst dieser Nutzer-Push darf AWS Amplify auslösen.
