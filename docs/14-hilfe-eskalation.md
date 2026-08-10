# 14 — Hilfestufen in Guided-Szenarien

Dieses Dokument definiert die verbindliche Bedeutung der drei `helpLevels` eines Trainingsschritts. Die Regel gilt für alle Szenarien, nicht nur für VS Code.

## Ziel

Hilfen müssen mit jeder Stufe konkreter werden. Wer mehr Hilfe anfordert, darf niemals weniger Information erhalten als zuvor.

Für einen Aktionsschritt gilt deshalb immer dieselbe Eskalation:

1. **Hilfe 1 — Orientierung:** Wo soll der Lernende suchen oder worauf soll er achten? Die Lösung wird noch nicht vollständig vorgegeben.
2. **Hilfe 2 — konkrete Anweisung:** Welche konkrete Aktion ist auszuführen? Das relevante Bedienelement oder der fachliche Arbeitsschritt wird eindeutig benannt.
3. **Hilfe 3 — maximale Hilfe:** Das genaue Ziel wird visuell hervorgehoben, sofern ein `highlightTarget` vorhanden ist, **und** der Text nennt die exakte Handlung. Ein Satz wie „Der Button wird hervorgehoben“ reicht nicht.

Beispiel:

```json
"helpLevels": [
  "Suche ganz links in der Activity Bar nach dem Explorer-Symbol.",
  "Klicke auf das oberste Symbol mit den zwei Dateien.",
  "Das Explorer-Symbol wird hervorgehoben. Klicke genau auf dieses Symbol."
]
```

Nicht zulässig ist eine rückwärts eskalierende Folge wie:

```json
"helpLevels": [
  "Der Explorer befindet sich links in der Activity Bar.",
  "Klicke auf das oberste Datei-Symbol.",
  "Das Explorer-Symbol wird hervorgehoben."
]
```

Die dritte Stufe ist hier schwächer als die zweite und enthält keine Handlungsanweisung.

## Erklärungsschritte

Schritte mit `stepType: "explanation"` verlangen keine Nutzeraktion. Für sie dürfen die drei Hilfestufen leer bleiben:

```json
"stepType": "explanation",
"helpLevels": ["", "", ""]
```

Bei Aktionsschritten sind leere Hilfestufen nicht zulässig.

## Visuelle Eskalation

Die Guided-Oberfläche verstärkt ein vorhandenes `highlightTarget` ab Hilfe 3. Das Highlight ersetzt aber niemals die textliche Handlungsanweisung. Content und visuelle Führung ergänzen sich:

- Hilfe 1: Orientierung im mentalen Modell.
- Hilfe 2: konkrete Aktion.
- Hilfe 3: konkrete Aktion plus stärkste verfügbare visuelle Führung.

Szenarien bleiben dabei DOM-unabhängig: `highlightTarget` ist eine semantische Runtime-Referenz und kein CSS-Selektor.

## CI-Regeln

`npm run validate:content` führt `scripts/validate-help-escalation.ts` aus. Für alle Aktionsschritte wird geprüft:

- keine der drei Hilfestufen ist leer,
- Hilfe 3 ist nicht kürzer als Hilfe 2,
- Hilfe 3 ist keine bloße Wiederholung von Hilfe 2,
- Hilfe 3 besteht nicht nur aus einem Hinweis auf Markierung, Highlight oder Rahmen ohne konkrete Handlungsanweisung.

Erklärungsschritte sind von diesen Aktionsregeln ausgenommen. Ein Verstoß lässt die Content-Validierung und damit `npm run check` fehlschlagen.

Die Längenprüfung ist bewusst nur eine Mindestbarriere. Gute Autorenarbeit bleibt zusätzlich erforderlich: Hilfe 1 soll orientieren, Hilfe 2 konkretisieren und Hilfe 3 die eindeutigste ausführbare Anweisung enthalten.
