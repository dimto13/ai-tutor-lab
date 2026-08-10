# 17 — Persona-Audit der bestehenden Szenarien

Stand: August 2026. Zielpersona für die vorhandenen Lernpfade ist `non-programmer`.

Alle zwölf Bestandsszenarien wurden gegen Persona, Glossarabdeckung, Anfängerpflichtpfad, Hilfe-Eskalation und fehlertolerante Freitextvalidierung geprüft.

| Szenario                                   | Ergebnis |
| ------------------------------------------ | -------- |
| `artifact-preview-foundation.guided`       | konform  |
| `copilot-basics.guided`                    | konform  |
| `developer-workflow-basics.guided`         | konform  |
| `html-page-workflow.guided`                | konform  |
| `research-workflow.guided`                 | konform  |
| `source-control-platform-basics.explore`   | konform  |
| `source-control-platform-basics.guided`    | konform  |
| `source-control-platform-basics.challenge` | konform  |
| `vscode-basics.explore`                    | konform  |
| `vscode-basics.guided`                     | konform  |
| `vscode-basics.challenge`                  | konform  |
| `vscode-shortcuts.challenge`               | konform  |

## Verbindliche Regeln

1. Jedes Szenario deklariert eine Zielpersona und die benötigten Glossarbegriffe.
2. Zentrale sichtbare Fachbegriffe müssen über `audience.glossaryConcepts` auflösbar sein.
3. Non-Programmer werden nicht ohne Einführung zum Schreiben von Programmcode gezwungen.
4. Advanced-Funktionen sind nur dann Pflicht, wenn sie für das konkrete Lernziel nötig sind.
5. Hilfen eskalieren Orientierung → konkrete Aktion → maximale Hilfe.
6. Freitext scheitert nicht an Magic Words, außer die konkrete Textinformation ist selbst Lernziel.

`scripts/validate-persona-audit.ts` liest alle deklarativen Glossarquellen unter `content/glossary` und läuft als Teil von `npm run validate:content`.
