## Projektbetrieb (verbindlich)

- **Single Source of Truth ist ausschließlich das Git-Repository `dimto13/ai-tutor-lab`.**
- Entwicklung, Builds und Tests erfolgen auf dem lokalen Entwicklungsrechner und auf Basis eines
  explizit ausgecheckten Git-Branches.
- Zusammenarbeit und Integration erfolgen über Git/GitHub mit Branches, Commits und Pull Requests.
- Ziel für Hosting und Deployment ist **AWS Amplify**.
- **Lovable war nur für den ersten POC/Bootstrap im Einsatz und ist ab jetzt kein Bestandteil des
  Entwicklungs-, Test-, Preview-, Publishing-, Deployment- oder Synchronisationsprozesses mehr.**
- Lovable-Links, Lovable-Previews oder eine GitHub↔Lovable-Synchronisierung sind kein gültiger Nachweis
  für den aktuellen Projektstand.

## Arbeitsregeln für KI-Agenten in diesem Repository

1. **Vor jeder Aufgabe lesen:** [`prompts/model-briefing.md`](prompts/model-briefing.md)
   (die sieben Architekturregeln) und bei Codearbeit zusätzlich
   [`docs/02-domaenenmodell.md`](docs/02-domaenenmodell.md).
2. **Backlog:** Inhaltliche Änderungen an Tickets nur in
   [`backlog/backlog.yaml`](backlog/backlog.yaml) — nie direkt in `docs/06-backlog.md`,
   `backlog/tickets.csv` oder im Issue-Text (alles generiert).
3. **Keine History-Rewrites und keine Force-Pushes**, sofern dies nicht ausdrücklich und bewusst
   für einen konkreten Git-Vorgang entschieden wurde.
4. Szenarien sind Daten (YAML/JSON), kein Code. Keine CSS-Selektoren, keine
   Herstellernamen in Dateinamen, kein Fortschritt per Weiter-Button.
5. **Lovable nicht verwenden** — weder für Codeänderungen noch für Preview, Publishing, Deployment,
   Synchronisation oder Fehlersuche.
