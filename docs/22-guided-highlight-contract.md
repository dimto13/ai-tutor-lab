# Guided-Highlight-Vertrag

## Zweck

Guided-Training darf eine korrekte Nutzeraktion nicht dadurch wie einen Stillstand wirken lassen, dass ein Spotlight auf einem bereits erledigten UI-Einstieg stehen bleibt. Die Trainingslogik bleibt dabei in der Training Engine beziehungsweise im deklarativen Szenario; das Overlay kennt keine Validatoren.

## Verantwortlichkeiten

- Das Szenario beschreibt `instruction`, `validation` und einen semantischen `highlightTarget`.
- Der Runtime-Adapter emittiert fachliche Events und löst semantische `UiTargetRef`-Werte in die aktuelle Oberfläche auf.
- Der Training Store entscheidet anhand der Validation über `pass`, `near-miss` oder `ignore`.
- `HighlightOverlay` zeichnet ausschließlich das vom aktiven Guided-Schritt vorgegebene Ziel. Es entscheidet nicht, ob eine Aktion fachlich richtig war.

## Autorierungsregel

Ein Guided-Schritt mit genau einem hervorgehobenen Ziel soll eine klar erkennbare Lernhandlung beschreiben.

Wenn eine Aufgabe mehrere UI-Aktionen benötigt, gilt eine der folgenden Varianten:

1. Die Aktionen werden in atomare Guided-Schritte getrennt, sodass nach jeder erfolgreichen Handlung das nächste semantische Ziel aktiv wird.
2. Der `highlightTarget` beschreibt einen stabilen Arbeitsbereich, der während der gesamten zusammengesetzten Handlung fachlich richtig bleibt.

Nicht zulässig ist ein mehrstufiger Schritt, dessen Highlight auf einem einmaligen Einstiegsknopf bleibt, obwohl dieser Einstieg nach dem ersten korrekten Klick bereits erledigt ist.

## Ursache aus #230

Im Szenario `git-basics` kombinierte `step_4` mehrere unterschiedliche Copilot-Handlungen:

- Copilot Chat öffnen,
- einen Inline-Vorschlag prüfen,
- den Vorschlag übernehmen.

Der markierte Target war `copilot.chat.toggle`. Ein Klick darauf emittiert `copilot.chat.opened`; abgeschlossen wurde der Schritt jedoch erst durch `ai.suggestion.accepted`. Das Overlay folgte korrekt dem weiterhin aktiven Schritt und blieb deshalb auf dem statischen Einstiegstarget stehen. Der Fehler lag damit nicht in der Overlay-Geometrie, sondern im nicht deckungsgleichen Content-Vertrag aus Handlung, Validator und Highlight.

Der reparierte Schritt behandelt den Inline-Vorschlag als eigene Editor-Handlung und markiert den stabilen Host-Arbeitsbereich `vscode.editor`. Dort sind sowohl der vorgeschlagene Code als auch der Hinweis `Tab – annehmen` sichtbar. Der feinere Copilot-Hinweis wird per Portal in den Host-Editor gerendert und ist deshalb kein geeigneter Cross-Container-Spotlight-Anker. Für den späteren zusammengesetzten Chat-Ablauf wird entsprechend die stabile `vscode.secondarySideBar` markiert, weil Copilot-Einstieg, Kontext und Prompt in diesem Arbeitsbereich liegen.

## Fallback

Ein `near-miss` erhält weiterhin verständliches `onFailure`-Feedback und kann einen passenden semantischen Zielbereich markieren. Irrelevante Runtime-Events bleiben `ignore` und werden nicht als Fehler gezählt. Die drei vorhandenen Hilfestufen bleiben der explizite Eskalationspfad, wenn ein Lernender trotz korrekter Zielorientierung nicht weiterkommt.

## Struktureller Audit

Beim #230-Audit wurde dasselbe Autorierungsrisiko auch bei weiteren zusammengesetzten Guided-Aufgaben gefunden, insbesondere bei Copilot-Kontext hinzufügen → Prompt senden sowie bei mehreren aufeinanderfolgenden Git-Kommandos. Diese Fälle müssen beim Ausbau des kombinierten End-to-End-Lernpfads (#125) nach derselben Regel atomisiert oder mit einem stabilen Arbeitsbereich versehen werden.
