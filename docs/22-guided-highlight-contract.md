# Guided-Highlight-Vertrag

## Zweck

Guided-Training darf eine korrekte Nutzeraktion nicht dadurch wie einen Stillstand wirken lassen, dass ein Spotlight auf einem bereits erledigten UI-Einstieg stehen bleibt. Gleichzeitig müssen Begriffe und räumliche Zusammenhänge aus einer Erklärung direkt mit der simulierten Produktoberfläche verbunden sein. Die Trainingslogik bleibt dabei in der Training Engine beziehungsweise im deklarativen Szenario; das Overlay kennt keine Validatoren.

## Verantwortlichkeiten

- Das Szenario beschreibt `instruction`, `validation` und einen semantischen `highlightTarget`.
- Der Runtime-Adapter emittiert fachliche Events und löst semantische `UiTargetRef`-Werte in die aktuelle Oberfläche auf.
- Der Training Store entscheidet anhand der Validation über `pass`, `near-miss` oder `ignore`.
- `HighlightOverlay` visualisiert semantische Ziele. Es entscheidet nicht, ob eine Aktion fachlich richtig war.
- Glossarbegriffe dürfen ausschließlich einen temporären Präsentationsfokus auslösen. Dieser Fokus emittiert kein Runtime-Event und verändert weder Validation noch Fortschritt.

## Zwei Arten visueller Führung

### 1. Aktions-Highlight

Ein Handlungsschritt markiert das Ziel der nächsten konkreten Lernhandlung. Das Ziel bleibt über `TrainingStep.highlightTarget` an den aktiven Schritt gekoppelt.

Beispiel:

- „Öffne jetzt den Explorer.“ → `vscode.activityBar.explorer`

Ein Guided-Schritt mit genau einem hervorgehobenen Ziel soll eine klar erkennbare Lernhandlung beschreiben.

Wenn eine Aufgabe mehrere UI-Aktionen benötigt, gilt eine der folgenden Varianten:

1. Die Aktionen werden in atomare Guided-Schritte getrennt, sodass nach jeder erfolgreichen Handlung das nächste semantische Ziel aktiv wird.
2. Der `highlightTarget` beschreibt einen stabilen Arbeitsbereich, der während der gesamten zusammengesetzten Handlung fachlich richtig bleibt.

Nicht zulässig ist ein mehrstufiger Schritt, dessen Highlight auf einem einmaligen Einstiegsknopf bleibt, obwohl dieser Einstieg nach dem ersten korrekten Klick bereits erledigt ist.

### 2. Konzept-Highlight

Ein Erklärschritt darf den Oberflächenbereich markieren, über den gerade gesprochen wird. Dabei werden die aktuell sichtbaren semantischen `uiTargets` des zugehörigen Glossarbegriffs zu einem visuellen Fokus zusammengeführt.

Beispiele:

- „Das hier ist die Activity Bar.“ → die zu `vscode.activity_bar` gehörenden sichtbaren Activity-Bar-Ziele werden gemeinsam umrahmt.
- „Die Side Bar zeigt den Inhalt des gewählten Hauptbereichs.“ → `vscode.sideBar` wird hervorgehoben.
- „Im Editor bearbeitest du den Dateiinhalt.“ → `vscode.editor` wird hervorgehoben.

Dasselbe Verhalten gilt interaktiv für im Guide dargestellte Glossarbegriffe: Öffnet ein Lernender eine Begriffserklärung, wechselt die blaue Markierung temporär zu den zugehörigen sichtbaren Oberflächenzielen. Beim Schließen der Begriffserklärung kehrt das Spotlight zum aktiven Schritt zurück.

**Wichtig:** Ein Konzept-Highlight ist reine Orientierung. Es löst keine Runtime-Aktion aus, zählt nicht als Versuch und kann einen Handlungsschritt nicht abschließen.

## Transiente handlungsrelevante Produktoberflächen

Ein semantisches Aktionsziel kann eine transiente Produktoberfläche öffnen, auf der die eigentliche Folgehandlung stattfindet, zum Beispiel ein Menü, Submenü, eine Command Palette oder einen Dialog. Solche Flächen gehören weiterhin vollständig zum simulierten Produkt und dürfen nicht durch Plattform-Chrome verdeckt werden.

Dafür gilt folgende Boundary:

- Ein `RuntimeAdapter` kann optional über `resolveTransientActionRegions()` die aktuell sichtbaren, handlungsrelevanten Rechtecke seiner Produktoberfläche beschreiben.
- Produktspezifische DOM-Kenntnis bleibt ausschließlich im konkreten Runtime-Adapter. `HighlightOverlay` und `TutorAttentionOverlay` erhalten nur Rechtecke und kennen weder VS-Code-Selektoren noch konkrete Menüeinträge.
- Adapter ohne diese optionale Fähigkeit funktionieren unverändert.
- Beide Plattform-Overlays verwenden dieselbe reine Platzierungslogik: bevorzugt unterhalb des Anchors, danach oberhalb und seitlich; wenn keine Position vollständig frei ist, gewinnt die Position mit der kleinsten Überschneidung. Die gewählte Position bleibt innerhalb des Viewports.
- Die Kollisionsvermeidung ist reine Präsentationslogik. Sie emittiert keine Runtime-Events und verändert weder Validation noch Fortschritt, Replay oder Recovery.

Damit bleibt der semantische `highlightTarget` stabil, während das Overlay auf eine nach dem Öffnen neu sichtbare, produktseitige Handlungsfläche reagieren kann.

## Sichtbarkeit und Fallback

Ein semantischer Zielbereich kann nur markiert werden, wenn er in der aktuellen Produktoberfläche tatsächlich sichtbar ist. Sind von einem Konzept mehrere `uiTargets` sichtbar, werden deren Rechtecke zu einem gemeinsamen Fokus zusammengeführt. Noch nicht geöffnete Bereiche werden nicht künstlich als erledigte Runtime-Aktion geöffnet.

Ein `near-miss` erhält weiterhin verständliches `onFailure`-Feedback und kann einen passenden semantischen Zielbereich markieren. Fehlerfeedback hat weiterhin Vorrang vor normaler Hilfestellung. Irrelevante Runtime-Events bleiben `ignore` und werden nicht als Fehler gezählt. Die drei vorhandenen Hilfestufen bleiben der explizite Eskalationspfad, wenn ein Lernender trotz korrekter Zielorientierung nicht weiterkommt.

## Ursache aus #230

Im Szenario `git-basics` kombinierte `step_4` mehrere unterschiedliche Copilot-Handlungen:

- Copilot Chat öffnen,
- einen Inline-Vorschlag prüfen,
- den Vorschlag übernehmen.

Der markierte Target war `copilot.chat.toggle`. Ein Klick darauf emittiert `copilot.chat.opened`; abgeschlossen wurde der Schritt jedoch erst durch `ai.suggestion.accepted`. Das Overlay folgte korrekt dem weiterhin aktiven Schritt und blieb deshalb auf dem statischen Einstiegstarget stehen. Der Fehler lag damit nicht in der Overlay-Geometrie, sondern im nicht deckungsgleichen Content-Vertrag aus Handlung, Validator und Highlight.

Der reparierte Schritt behandelt den Inline-Vorschlag als eigene Editor-Handlung und markiert den stabilen Host-Arbeitsbereich `vscode.editor`. Dort sind sowohl der vorgeschlagene Code als auch der Hinweis `Tab – annehmen` sichtbar. Der feinere Copilot-Hinweis wird per Portal in den Host-Editor gerendert und ist deshalb kein geeigneter Cross-Container-Spotlight-Anker. Für den späteren zusammengesetzten Chat-Ablauf wird entsprechend die stabile `vscode.secondarySideBar` markiert, weil Copilot-Einstieg, Kontext und Prompt in diesem Arbeitsbereich liegen.

## Erweiterung aus #272

#272 erweitert den Vertrag um die räumliche Orientierung vor beziehungsweise neben der eigentlichen Handlung. Die blaue Umrandung ist damit nicht nur ein „hier klicken“-Mechanismus, sondern auch eine didaktische Verbindung zwischen Begriff, Erklärung und Produktoberfläche.

Die beiden Pfade bleiben strikt getrennt:

```text
Guide-/Glossarbegriff → temporärer Konzeptfokus → HighlightOverlay

Nutzeraktion → RuntimeEvent → Validation → Fortschritt
```

Dadurch kann ein Lernender sich einen Bereich beliebig oft zeigen lassen, ohne dass diese Orientierung als fachliche Handlung gewertet wird.

## Struktureller Audit

Beim #230-Audit wurde dasselbe Autorisierungsrisiko auch bei weiteren zusammengesetzten Guided-Aufgaben gefunden, insbesondere bei Copilot-Kontext hinzufügen → Prompt senden sowie bei mehreren aufeinanderfolgenden Git-Kommandos. Diese Fälle müssen beim Ausbau des kombinierten End-to-End-Lernpfads (#125) nach derselben Regel atomisiert oder mit einem stabilen Arbeitsbereich versehen werden.
