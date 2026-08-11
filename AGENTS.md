## Projektbetrieb (verbindlich)

- **Single Source of Truth ist ausschließlich das Git-Repository `dimto13/ai-tutor-lab`.**
- Entwicklung, Builds und Tests erfolgen auf dem lokalen Entwicklungsrechner und auf Basis eines
  explizit ausgecheckten Git-Branches.
- Zusammenarbeit und Integration erfolgen über Git/GitHub mit Branches, Commits und Pull Requests.
- **Keine direkten Pushes auf `main`.** Änderungen laufen über einen eigenen Branch und einen
  Pull Request.
- Ziel für Hosting und Deployment ist **AWS Amplify**. AWS beobachtet den Release-Branch `deploy`;
  ein Merge nach `main` löst bewusst noch kein Deployment aus.
- **Lovable war nur für den ersten POC/Bootstrap im Einsatz und ist ab jetzt kein Bestandteil des
  Entwicklungs-, Test-, Preview-, Publishing-, Deployment- oder Synchronisationsprozesses mehr.**
- Lovable-Links, Lovable-Previews oder eine GitHub↔Lovable-Synchronisierung sind kein gültiger Nachweis
  für den aktuellen Projektstand.

## Arbeitsregeln für KI-Agenten in diesem Repository

1. **Vor jeder Aufgabe lesen:** [`prompts/model-briefing.md`](prompts/model-briefing.md)
   (die sieben Architekturregeln) und bei Codearbeit zusätzlich
   [`docs/02-domaenenmodell.md`](docs/02-domaenenmodell.md). Bei Arbeit an `amplify.yml`,
   Amplify-Backend-Code oder AWS-Deployment zusätzlich
   [`docs/19-aws-amplify-konventionen.md`](docs/19-aws-amplify-konventionen.md).
2. **Aufgabenverwaltung läuft ausschließlich über GitHub Issues.** Neue Aufgaben werden direkt
   als Issue angelegt — mit Epic-Label, Prio-Label, Typ-Label und Milestone, und als Sub-Issue
   unter dem passenden Epic. Inhaltliche Änderungen an Tickets gehören in den Issue-Text.
   `backlog/backlog.yaml`, `backlog/tickets.csv` und `docs/06-backlog.md` sind eingefrorenes
   Archiv des ursprünglichen Planungsstands und dürfen nicht mehr gepflegt werden. Das dauerhafte
   Implementation-Control-Issue #201 ist davon bewusst ausgenommen: Es ist kein Backlog-Task,
   sondern ein operatives Status- und Handoff-Artefakt und bleibt deshalb ohne Milestone offen.
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
7. **Keine temporären GitHub-Actions-Workflows für Implementierungsarbeit.** Dateien unter
   `.github/workflows/` dürfen nicht als einmalige Implementierungs-, Patch-, Formatter- oder
   Migrations-Runner angelegt werden. Solche Arbeiten erfolgen lokal auf dem Feature-Branch mit den
   dafür vorgesehenen Projektwerkzeugen. Neue oder geänderte Workflows müssen eine dauerhafte
   Repository-Funktion haben und Bestandteil des eigentlichen Review-Scopes sein.
8. **Session- und Kontextmanagement über #201.** Bei längeren Implementierungsläufen wird der
   operative Stand im Implementation-Control-Issue #201 gepflegt. Eine neue Session darf sich nicht
   ausschließlich auf Chat-Historie oder Modellgedächtnis verlassen, sondern prüft mindestens den
   aktuellen `main`-SHA, #201 inklusive letztem Handoff, die Issues des nächsten Arbeitsblocks sowie
   relevante offene PRs/CI-Läufe. Ein Session-Cut erfolgt bevorzugt an natürlichen Grenzen
   (abgeschlossener Architekturblock, ungefähr 2–4 Issues/PRs, grüner Merge vor Themenwechsel oder
   früher bei hoher Kontextlast). Vor dem Cut wird in #201 ein Handoff mit Start-/End-SHA,
   abgeschlossenen Arbeiten, Architekturentscheidungen, offenen Risiken und dem exakten nächsten
   Arbeitsschritt hinterlegt. Die Session-Health-Werte `FRESH`, `ACTIVE`, `CUT-SOON` und `CUT` sind
   qualitative Arbeitsmetriken und keine behauptete exakte Tokenmessung.
9. **`deploy` ist ausschließlich Release-Zeiger.** KI-Agenten entwickeln nicht auf `deploy`, mergen
   nicht nach `deploy` und verschieben diesen Ref nicht. Nach einem vollständig grünen Merge nach
   `main` führt ausschließlich der Repository-Eigentümer die bewusste Deployment-Freigabe mit
   `git push origin main:deploy` aus. Erst dieser Nutzer-Push darf AWS Amplify auslösen.
