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

3. **Die Assistenzleiste wird schmaler** (320 px auf 256 px), sobald der Arbeitsbereich-Rumpf
   schmaler als 800 px ist. Sie bleibt offen und bedienbar: In den betroffenen Schritten ist sie der
   Grund, warum es eng ist, denn dort wird gerade eine Eingabe verlangt. 256 px reichen für Eingabe
   und Vorschläge.

4. **Der Explorer klappt ganz ein**, solange der Chat offen ist und der Rumpf schmaler als 736 px
   ist. Den Chat zu schließen bringt ihn zurück. Das ist vertretbar, weil kein Guided-Schritt mit
   Ergebnisfläche und Assistenz auf den Explorer zielt; diese Schritte zielen auf
   `copilot.chat.prompt` oder `artifact.preview.*`.

Die Schwellen folgen aus der Breitenbilanz des Rumpfs (Activity-Bar 48 px, Explorer, Editor-Bereich,
Assistenz) bei einer Untergrenze von 320 px für den Editor-Bereich: kompakter Explorer und volle
Assistenz brauchen 800 px, kompakter Explorer und schmale Assistenz 736 px. Unterhalb von 1024 px
Viewport-Breite greift diese Kette nicht mehr allein: Die Trainingsroute schaltet dort zwischen
Arbeitsbereich und Guide um, statt beide nebeneinander zu zeigen.

**Niedrige Viewports.** Gestapelt wird ab 340 px Höhe des Editor-Bereichs, nicht erst ab 400 px. Ein
1366×768-Laptop mit Browserleiste hat einen Viewport von rund 1366×600 bis 1366×660, und mit der
Grenze von 400 px blieben Editor und Ergebnisfläche dort nebeneinander bei je rund 200 px.

Gestapelt belegen die festen Zeilen der Ergebnisfläche (Kopfzeile, Auswahl, Titel, Aktionen) aber rund
215 px. Bei 60 % von 340–460 px Höhe blieb für das gerenderte Ergebnis nur das Padding. Unter 460 px
Höhe (Variante `workspace-low`) bekommt die Ergebnisfläche deshalb 68 % statt 60 %, die Kopfzeile wird
kompakter, und die Beschreibungszeile des Artefakts entfällt. Der Inhalt behält so 65–105 px, der Editor
rund vier bis fünf Zeilen, und die Aktionen bleiben ohne Scrollen sichtbar. Die ganze Ergebnisfläche
scrollen zu lassen ist keine Alternative: Guided-Spotlights scrollen ihr Ziel nicht in den sichtbaren
Bereich und würden dann auf einen verdeckten Knopf zeigen.

**Zeilen der Ergebnisfläche.** Kopfzeile, Artefakt-Auswahl, Titelzeile mit Umschalter
Vorschau/Quelltext und die Aktionszeile brechen um, statt horizontal zu scrollen. Ein Knopf, den man
nur durch seitliches Scrollen in einer 128 px breiten Fläche erreicht, ist auf Touch-Geräten praktisch
nicht auffindbar.

## Umsetzung

Entschieden wird an der real verfügbaren Fläche, nicht an der Viewport-Breite. Dafür tragen zwei
Ebenen einen CSS-Container:

- der **Arbeitsbereich-Rumpf** (`@container`, inline-size) trägt die Entscheidung über den Explorer,
- der **Editor-Bereich** (`container-type: size`) trägt die Entscheidung über das Stapeln. Die
  Variante `workspace-stacked` in `apps/web/src/styles.css` fragt beide Achsen ab:
  `(max-width: 680px) and (min-height: 340px)`. 680 px folgt aus 366 px lesbarer Editorbreite bei
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
Ergebnisfläche und Copilot auf 1280×900, 1440×900, 1300×620 (niedrig) und 1024×768 (schmal), in
getrennten Testfällen. Der Test prüft die Grenzen und die Anordnung, nicht eine bestimmte
Himmelsrichtung: beide Flächen behalten ihre Untergrenze, keine überlagert eine andere, die Assistenz
bleibt rechts, und die Ergebnisfläche liegt entweder rechts vom Editor oder darunter. Außerdem
scrollt die Ergebnisfläche nicht horizontal, und „Ergebnis geprüft“ liegt in ihrer Breite. Dieselbe
Begrenzung prüft ein eigener Testfall bei 320 px und 390 px ohne Assistenz. Gestapelt muss außerdem
vom gerenderten Ergebnis eine Mindesthöhe sichtbar bleiben. Geprüft wird die Fläche,
nicht die Klickbarkeit: Playwright scrollt für einen Klick selbst und bliebe sonst grün.

Gemessen wird erst, wenn zwei aufeinanderfolgende Messungen identisch sind. Die Assistenzleiste
animiert ihre Breite; eine einzelne Messung direkt nach dem Öffnen trifft sonst das Layout mitten im
Übergang und liefert Breiten, die es nie gab. Jede Fehlermeldung enthält die gemessene Geometrie,
damit ein Fehlschlag nicht erst im nächsten CI-Lauf erklärbar wird.
