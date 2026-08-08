<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Arbeitsregeln für KI-Agenten in diesem Repository

1. **Vor jeder Aufgabe lesen:** [`prompts/model-briefing.md`](prompts/model-briefing.md)
   (die sieben Architekturregeln) und bei Codearbeit zusätzlich
   [`docs/02-domaenenmodell.md`](docs/02-domaenenmodell.md).
2. **Backlog:** Inhaltliche Änderungen an Tickets nur in
   [`backlog/backlog.yaml`](backlog/backlog.yaml) — nie direkt in `docs/06-backlog.md`,
   `backlog/tickets.csv` oder im Issue-Text (alles generiert).
3. **Keine History-Rewrites, keine Force-Pushes** (siehe Hinweis oben).
4. Szenarien sind Daten (YAML/JSON), kein Code. Keine CSS-Selektoren, keine
   Herstellernamen in Dateinamen, kein Fortschritt per Weiter-Button.
