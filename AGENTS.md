## Projektbetrieb (verbindlich)

- **Single Source of Truth ist ausschließlich das Git-Repository `dimto13/ai-tutor-lab`.**
- Entwicklung, Builds und Tests erfolgen auf dem lokalen Entwicklungsrechner und auf Basis eines
  explizit ausgecheckten Git-Branches.
- Zusammenarbeit und Integration erfolgen über Git/GitHub mit Branches, Commits und Pull Requests.
- **Keine direkten Pushes auf `main`.** Änderungen laufen über einen eigenen Branch und einen
  Pull Request.
- Ziel für Hosting und Deployment ist **AWS Amplify**.
- **Lovable war nur für den ersten POC/Bootstrap im Einsatz und ist ab jetzt kein Bestandteil des
  Entwicklungs-, Test-, Preview-, Publishing-, Deployment- oder Synchronisationsprozesses mehr.**
- Lovable-Links, Lovable-Previews oder eine GitHub↔Lovable-Synchronisierung sind kein gültiger Nachweis
  für den aktuellen Projektstand.

## Arbeitsregeln für KI-Agenten in diesem Repository

1. **Vor jeder Aufgabe lesen:** [`prompts/model-briefing.md`](prompts/model-briefing.md)
   (die sieben Architekturregeln) und bei Codearbeit zusätzlich
   [`docs/02-domaenenmodell.md`](docs/02-domaenenmodell.md).
2. **Aufgabenverwaltung läuft ausschließlich über GitHub Issues.** Neue Aufgaben werden direkt
   als Issue angelegt — mit Epic-Label, Prio-Label, Typ-Label und Milestone, und als Sub-Issue
   unter dem passenden Epic. Inhaltliche Änderungen an Tickets gehören in den Issue-Text.
   `backlog/backlog.yaml`, `backlog/tickets.csv` und `docs/06-backlog.md` sind eingefrorenes
   Archiv des ursprünglichen Planungsstands und dürfen nicht mehr gepflegt werden.
3. **Keine History-Rewrites und keine Force-Pushes**, sofern dies nicht ausdrücklich und bewusst
   für einen konkreten Git-Vorgang entschieden wurde.
4. Szenarien sind Daten (YAML/JSON), kein Code. Keine CSS-Selektoren, keine
   Herstellernamen in Dateinamen, kein Fortschritt per Weiter-Button.
5. **Nur Grünes nach `main`.** `npm run check` läuft nach der letzten inhaltlichen Änderung
   eines Branches, nicht davor. Ein Pull Request wird erst gemergt, wenn die Jobs `validate`
   **und** `e2e-training-modes` abgeschlossen und grün sind — ein noch laufender Workflow ist
   kein grüner Workflow. Der Pre-Commit-Hook in `.githooks/` fängt Formatverstöße bereits beim
   Commit ab; er wird durch `npm ci` automatisch aktiviert.
6. **Lovable nicht verwenden** — weder für Codeänderungen noch für Preview, Publishing, Deployment,
   Synchronisation oder Fehlersuche.
