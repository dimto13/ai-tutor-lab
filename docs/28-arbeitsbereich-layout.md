# Arbeitsbereich-Layout: Lesbarkeitsgrenzen und Ausweichstrategie

Dieses Dokument hält die verbindliche Ausweichstrategie des simulierten Arbeitsbereichs fest. Sie
gehört dokumentiert, weil der Fehlerfall sonst wiederkehrt: alle Bereiche sichtbar, alle unlesbar.

## Problem

Explorer, Editor, Ergebnisfläche und ein Assistenz-Panel teilten sich den Platz rein proportional.
Keiner hatte eine Untergrenze, also wurde der Editor bei mehreren offenen Bereichen bis zur
Unlesbarkeit zusammengedrückt — gemessen bis auf 24 px, also etwa drei Zeichen pro Zeile. Genau in
dem Schritt, in dem Lernende den Auftragstext brauchen, war er nicht mehr lesbar.

Verschärft wurde das durch eine Verwechslung: die Breiten hingen an **Viewport**-Breakpoints
(`sm:`, `md:`). Bei 1280 px Viewport nimmt der Platform-Guide aber so viel Platz, dass dem
Arbeitsbereich nur noch rund 900 px bleiben. Die `md:`-Regeln galten weiter und vergaben Breiten,
die gar nicht vorhanden waren.

## Grundsatz

Kein Arbeitsbereich wird unter seine Lesbarkeitsgrenze gedrückt, und kein Bereich überlagert einen
anderen. Reicht der Platz nicht, wird gestapelt oder eingeklappt — nicht weiter gequetscht.

| Fläche         | Untergrenze | Begründung                                                   |
| -------------- | ----------- | ------------------------------------------------------------ |
| Editor         | ~366 px     | rund 40 Zeichen bei 13 px JetBrains Mono, plus Zeilennummern |
| Ergebnisfläche | ~280 px     | Kopfzeile mit Status-Badges bleibt lesbar und bedienbar      |

## Ausweichreihenfolge

Reicht die Breite nicht, gibt in dieser Reihenfolge nach:

1. **Die Ergebnisfläche rutscht unter den Editor.** Sie behält die volle Breite und bekommt ihre
   natürliche Höhe, höchstens 60 % des Editor-Bereichs; darüber scrollt sie. Der Editor bekommt die
   volle Breite und die restliche Höhe.

   Bewusst nicht die halbe Höhe: Kopfzeile, Reiter, Revisionszeile und Fußzeile der Ergebnisfläche
   sind fest und brauchen je nach Szenario bis zu 290 px. Bekommt sie weniger, malen diese Zeilen
   über ihren Kasten hinaus und die Aktionsknöpfe landen unter der Statusleiste — messbar als
   Playwright-Klick, den die Statusleiste abfängt. Mit natürlicher Höhe bleibt außerdem mehr Platz
   für den Editor.

2. **Der Explorer geht auf seine kompakte Breite zurück** (240 px auf 112 px), sobald Schritt 1
   nicht reicht. Das gilt nur, solange Ergebnisfläche und Assistenz gleichzeitig offen sind, damit
   sich außerhalb dieser Kombination nichts am Explorer ändert. Die Activity-Bar bleibt sichtbar,
   der Explorer ist also mit einem Klick zurück.

Die Assistenzleiste gibt nicht nach: sie ist in den betroffenen Schritten der Grund, warum es eng
ist — dort wird gerade eine Eingabe verlangt.

## Umsetzung

Entschieden wird an der real verfügbaren Fläche, nicht an der Viewport-Breite. Dafür tragen zwei
Ebenen einen CSS-Container:

- der **Arbeitsbereich-Rumpf** (`@container`, inline-size) trägt die Entscheidung über den Explorer,
- der **Editor-Bereich** (`container-type: size`) trägt die Entscheidung über das Stapeln. Die
  Variante `workspace-stacked` in `apps/web/src/styles.css` fragt beide Achsen ab:
  `(max-width: 680px) and (min-height: 400px)`. 680 px folgt aus 366 px lesbarer Editorbreite bei
  einem Breitenanteil von 54 %.

Zwei Fallen, die dabei je einen Fehlversuch gekostet haben:

- Eine Container-Query wird immer gegen den nächsten **Vorfahren**-Container ausgewertet. `@container`
  und die zugehörige Variante dürfen deshalb nicht auf demselben Element stehen — sonst entscheidet
  unbemerkt der äußere Container. Die Richtung sitzt daher auf einem inneren Element des
  Editor-Bereichs.
- Gemessen werden muss der **Editor-Bereich**, nicht die Editor-Spalte. Die Spalte enthält
  zusätzlich Tableiste und Terminal; bei offenem Terminal bleiben dem Editor-Bereich rund 280 px,
  und das reicht zum Stapeln nicht.

Die Ergebnisfläche trägt selbst keine Mindestbreite mehr. Eine feste `min-width` auf ihr war die
unmittelbare Ursache dafür, dass der Editor nachgeben musste statt sie.

## Absicherung

Der vollständige E2E-Lauf ist die Absicherung, nicht nur der neue Test: die erste Fassung dieser
Strategie stapelte auch dort, wo die Höhe nicht reichte, und brach vier Trainingsabläufe, deren
Aktionsknöpfe dann unter der Statusleiste lagen.

`apps/web/e2e/tests/artifact-preview.spec.ts` prüft die Panelkombination aus Explorer, Editor,
Ergebnisfläche und Copilot auf 1280 px und 1440 px, in getrennten Testfällen. Der Test prüft die
Grenzen und die Anordnung, nicht eine bestimmte Himmelsrichtung: beide Flächen behalten ihre
Untergrenze, keine überlagert eine andere, die Assistenz bleibt rechts, und die Ergebnisfläche liegt
entweder rechts vom Editor oder darunter.

Gemessen wird erst, wenn zwei aufeinanderfolgende Messungen identisch sind. Die Assistenzleiste
animiert ihre Breite; eine einzelne Messung direkt nach dem Öffnen trifft sonst das Layout mitten im
Übergang und liefert Breiten, die es nie gab. Jede Fehlermeldung enthält die gemessene Geometrie,
damit ein Fehlschlag nicht erst im nächsten CI-Lauf erklärbar wird.
