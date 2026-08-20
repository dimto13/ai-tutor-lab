# 13 — Autorenleitfaden: KI-Workflows in der Praxis

Dieser Leitfaden definiert das verbindliche Autorenmuster für produktive Szenarien der Modullinie **„KI-Workflows in der Praxis“**. Er ergänzt das Domänenmodell und den maschinenlesbaren Vertrag in `content/catalog/module-lines.json`.

Die Modullinie erklärt nicht primär die Bedienung eines Werkzeugs. Sie zeigt, **was KI in einem realistischen Arbeitsablauf tut, welches überprüfbare Ergebnis entsteht und wie der Lernende dieses Ergebnis fachlich beurteilt**.

## 1. Abgrenzung und Katalogvertrag

Ein Workflow-Modul ist richtig eingeordnet, wenn das Lernziel auf einem vollständigen Arbeitsablauf liegt und nicht auf einem einzelnen Produktmerkmal.

- `tool`: Bedienung eines Werkzeugs, z. B. Explorer oder Pull Request öffnen.
- `concept`: einen Begriff oder Zusammenhang verstehen.
- `ai_workflow`: eine Aufgabe an KI delegieren, sichtbare Arbeitsschritte nachvollziehen, ein Artefakt iterieren und das Ergebnis aktiv prüfen.

Werkzeugwissen darf in einem Workflow vorausgesetzt oder beiläufig wiederholt werden. Ein Workflow-Szenario ersetzt jedoch keine Werkzeuggrundlage.

Die maschinenlesbare Single Source of Truth für die Modullinie liegt in `content/catalog/module-lines.json`:

- `lines[].id = "ai-workflows-in-practice"` kennzeichnet die gemeinsame Modullinie.
- `learningLayer = "ai_workflow"` bindet sie an die bestehende fachliche Szenarioschicht.
- `moduleIds` bestimmt explizit, welche produktiven Module im Trainingskatalog zu dieser Linie gehören.
- `patternId = "ai-workflow-seven-step"` referenziert das wiederverwendbare didaktische Muster.

`learningLayer: "ai_workflow"` allein bedeutet deshalb **nicht**, dass ein Enabler- oder Foundation-Szenario automatisch als produktives Modul dieser Linie erscheint. Neue Fachmodule werden erst durch ihre eigene Story umgesetzt und anschließend bewusst in `moduleIds` registriert.

Die Runtime löst die Linie über den bestehenden Szenariokatalog auf. Weder Content noch Modullinienvertrag enthalten DOM-/CSS-Selektoren oder komponentenspezifische Navigationslogik.

## 2. Verbindliche Dramaturgie

Jedes produktive Modul der Modullinie folgt inhaltlich denselben sieben Phasen. Mehrere konkrete `steps` dürfen zu einer Phase gehören, aber keine Phase darf entfallen.

### Phase 1 — Ausgangslage / Arbeitskontext

Die Aufgabe muss realistisch und ohne KI spürbar aufwendig sein.

Der Lernende soll verstehen:

- welches fachliche Ziel erreicht werden soll,
- welche Ausgangsdaten oder Quellen vorliegen,
- weshalb die Aufgabe ohne Unterstützung Zeit oder Konzentration kostet.

Nicht ausreichend ist eine abstrakte Aufgabe wie „Teste die KI“.

### Phase 2 — Aufgabe oder Problem

Der Lernende formuliert den Auftrag selbst. Ein vollständiger Prompt wird nicht einfach zum Abschreiben vorgegeben.

Der Auftrag soll mindestens abdecken:

- Ziel,
- relevanten Kontext,
- gewünschte Eingrenzung oder Qualitätsbedingung,
- gewünschtes Ausgabeformat.

Hilfestufen dürfen diese Bestandteile einzeln sichtbar machen, aber nicht sofort die vollständige Lösung liefern.

### Phase 3 — KI-Einsatz

Die Bearbeitung darf nicht als Sprung von Prompt zu Endergebnis erscheinen.

Der Simulator zeigt nachvollziehbare Zwischenstufen, zum Beispiel:

- Plan oder Arbeitsschritte,
- mehrere Werkzeug- oder Suchaufrufe,
- Zwischenresultate,
- ausgewählte Quellen,
- Transformationen von Eingabedaten.

Die Ausgaben bleiben deterministisch hinterlegt. Das Szenario benötigt keine echte Websuche, keine echte Unternehmensdatei und keinen nicht reproduzierbaren Modellaufruf.

### Phase 4 — Artefakt / Arbeitsprodukt

Das fachliche Ergebnis erscheint auf einer sichtbaren Ergebnisfläche und nicht ausschließlich als Chattext.

Geeignete Artefakte sind zum Beispiel:

- HTML-Vorschau,
- Tabelle,
- strukturierter Datenauszug,
- Bericht oder Zusammenfassung mit prüfbaren Referenzen.

Das Artefakt muss so konkret sein, dass der Lernende einzelne Aussagen oder Werte prüfen kann.

### Phase 5 — Iteration / Verbesserung

Der Lernende verlangt mindestens eine gezielte Änderung am bestehenden Ergebnis.

Beispiele:

- zusätzliche Tabellenspalte,
- andere Sortierung,
- veränderte Darstellung,
- Einschränkung auf einen Zeitraum,
- Ergänzung eines Vergleichskriteriums.

Die Änderung muss im Artefakt sichtbar werden. Eine reine Bestätigung im Chat reicht nicht.

### Phase 6 — Prüfung / Verifikation

**Diese Phase ist verpflichtend und darf nicht übersprungen werden.**

Jedes produktive Modul enthält mindestens einen realistischen, fachlich auffindbaren Schwachpunkt. Der Lernende muss das KI-Ergebnis aktiv gegen eine Quelle, eine Regel oder nachvollziehbare Ausgangsdaten prüfen.

Geeignete Schwachpunkte sind zum Beispiel:

- veraltete Quelle,
- Aussage wird von der verlinkten Quelle nicht gedeckt,
- falsche Zellreferenz,
- plausibel klingender, aber falscher Zahlenwert,
- ausgelassener Datensatz,
- widersprüchliche Einheit oder Zeitraum.

Der Prüfschritt gilt erst als bestanden, wenn der vorgesehene Schwachpunkt erkannt oder markiert wurde. Ein bloßes Öffnen der Prüfansicht ist keine erfolgreiche Validierung.

Der Fehler muss:

1. realistisch sein,
2. mit den im Szenario verfügbaren Informationen auffindbar sein,
3. reproduzierbar im Seed oder Artefaktzustand hinterlegt sein,
4. durch eine deklarative Event- oder State-Validierung prüfbar sein,
5. nach der Lernhandlung ein nachvollziehbares Feedback auslösen.

Der maschinenlesbare Pattern-Vertrag sichert für diese Phase `requiresEmbeddedWeakness`, `requiresActiveLearnerAction`, `requiresDeterministicValidation` und `requiresFeedback` ab.

### Phase 7 — Transfer / Wiederholung

Zum Abschluss ordnet das Szenario den Workflow ein und macht ihn auf ähnliche Aufgaben übertragbar.

Mindestens zu behandeln sind:

- wann der Workflow sinnvoll ist,
- welche Teile weiterhin menschliche Prüfung brauchen,
- welche Daten die System- oder Unternehmensgrenze verlassen könnten,
- wo Halluzinationen oder unvollständige Ergebnisse auftreten können,
- welche Nachvollziehbarkeit für eine geschäftliche Entscheidung erforderlich ist.

## 3. Nicht-Programmierer als Zielgruppe

Mindestens die Hälfte der produktiven Workflow-Module der Modullinie muss ohne Programmierkenntnisse durchführbar sein.

Dafür gelten folgende Autorenregeln:

- keine Codekenntnis als versteckte Voraussetzung,
- Fachbegriffe vor der ersten notwendigen Verwendung erklären,
- Interaktionen über fachliche Aufgaben formulieren statt über Implementierungsdetails,
- technische Konzepte wie MCP oder Agent nur so tief erklären, wie sie für Risiko und Arbeitsweise relevant sind.

Ein Szenario darf technische Infrastruktur verwenden, ohne dass der Lernende sie programmieren muss.

## 4. Deterministische Simulation statt Produktdemo

Workflow-Szenarien laufen gegen reproduzierbare Simulatorzustände.

Die sichtbare KI-Arbeit kann reale Arbeitsschritte nachbilden, aber ihre Ergebnisse werden für das Training deterministisch vorbereitet. Das ist beabsichtigt:

- CI kann jeden Endzustand prüfen,
- ein eingebauter Fehler bleibt zuverlässig vorhanden,
- Lernende erhalten vergleichbare Aufgaben,
- externe Dienste oder aktuelle Webinhalte machen das Training nicht instabil.

Eine reale Web-, Datei- oder Modellintegration darf später denselben Vertrag erfüllen, ist aber keine Voraussetzung für ein Content-Szenario.

## 5. Autorenvertrag für neue Module

Für jedes neue Workflow-Modul wird vor der Implementierung festgelegt:

| Feld                     | Verpflichtende Aussage                             |
| ------------------------ | -------------------------------------------------- |
| `moduleId`               | stabile Modul-ID für die zusammengehörigen Modi    |
| `learningLayer`          | `ai_workflow`                                      |
| Modullinie               | Registrierung in `ai-workflows-in-practice`        |
| didaktisches Muster      | `ai-workflow-seven-step`                           |
| Zielgruppe               | mit oder ohne Programmierkenntnisse                |
| Ausgangslage             | reale, ohne KI mühsame Aufgabe                     |
| Auftrag                  | welche Bestandteile der Lernende selbst formuliert |
| sichtbare KI-Arbeit      | welche Zwischenstufen gezeigt werden               |
| Artefakt                 | welches prüfbare Ergebnis entsteht                 |
| Iteration                | welche sichtbare Änderung angefordert wird         |
| eingebauter Schwachpunkt | exakter Fehler und seine Quelle im Seed            |
| Prüfnachweis             | Event/State, das die Erkennung des Fehlers belegt  |
| Feedback                 | Rückmeldung nach der aktiven Prüfung               |
| Transfer                 | Risiken, Grenzen und geeigneter Einsatz            |

Explore, Guided und Challenge dürfen dieselbe fachliche Geschichte unterschiedlich führen. Der Challenge-Modus bewertet bevorzugt den Zielzustand und nicht eine vorgeschriebene Klickfolge.

## 6. Validierungsregeln

Autoren sollen bestehende deklarative Runtime-Verträge verwenden.

- `event`: eine fachlich relevante Aktion ist erfolgt.
- `state`: ein überprüfbarer Zielzustand ist erreicht.
- `all`: mehrere notwendige Bedingungen müssen gemeinsam erfüllt sein.

Für einen Prüfschritt mit zwei eingebauten Mängeln müssen beide Bedingungen im Erfolgszustand nachweisbar sein. Ein einzelnes generisches „verifiziert“-Ereignis darf nicht fälschlich beide Befunde ersetzen.

Das Szenario kennt nur semantische Runtime-Referenzen. CSS-Selektoren und komponentenspezifische DOM-Abhängigkeiten gehören nicht in Content-Dateien.

Der Content-Check validiert zusätzlich den Modullinienvertrag:

- referenzierte Patterns existieren,
- produktive `moduleIds` existieren im Szenariokatalog,
- Szenarien eines registrierten Moduls verwenden den erwarteten `learningLayer`,
- die KI-Workflow-Linie besitzt exakt die sieben vereinbarten Phasen,
- Phase 6 trägt den aktiven Prüfvertrag mit eingebautem Schwachpunkt.

## 7. Anti-Patterns

Folgende Umsetzungen gehören nicht in diese Modullinie:

- Prompt anklicken und sofort einen fertigen Chattext anzeigen.
- Lernenden einen vollständig fertigen Prompt nur abschreiben lassen.
- Prüfschritt durch „Sieht gut aus“ oder einen Bestätigungsbutton ersetzen.
- Fehler einbauen, der mit den verfügbaren Informationen nicht gefunden werden kann.
- echte Websuche voraussetzen, obwohl das Szenario deterministisch testbar sein soll.
- Produktbedienung als Workflow verkaufen, ohne fachliches Artefakt und Ergebnisprüfung.
- technische Fachbegriffe bei Nicht-Programmierern ungeklärt voraussetzen.
- ein Child-Issue durch bloße Registrierung eines noch nicht implementierten Moduls vorwegnehmen.

## 8. Abnahmecheckliste

Vor einem Pull Request für ein neues produktives Modul müssen Autoren prüfen:

- [ ] `learningLayer` ist `ai_workflow`.
- [ ] `moduleId` ist nach Implementierung bewusst in der Modullinie registriert.
- [ ] Ausgangslage beschreibt einen realistischen Nutzen.
- [ ] Lernender formuliert Ziel, Kontext und Ausgabeformat selbst.
- [ ] KI-Arbeit enthält sichtbare Zwischenstufen.
- [ ] Ergebnis erscheint als veränderbares oder prüfbares Artefakt.
- [ ] Mindestens eine Iteration verändert das Artefakt sichtbar.
- [ ] Mindestens ein realistischer Schwachpunkt ist deterministisch eingebaut.
- [ ] Prüfschritt kann nur nach tatsächlicher Erkennung des Schwachpunkts erfolgreich sein.
- [ ] Nach der Prüfung erhält der Lernende fachlich passendes Feedback.
- [ ] Transfer behandelt Grenzen, Risiken und Wiederverwendung.
- [ ] Zielgruppe und vorausgesetztes Wissen sind explizit.
- [ ] Guided-Pfad ist vollständig durchlaufbar.
- [ ] Challenge bewertet soweit möglich den Endzustand statt die Klickreihenfolge.
- [ ] CI-validierbare Seeds und semantische Runtime-Targets werden verwendet; keine DOM-/CSS-Selektoren.

## 9. Verhältnis zu den Folge-Szenarien

AITP-151 definiert den gemeinsamen Rahmen. Die konkreten Workflow-Szenarien werden in den dafür vorgesehenen Folge-Issues implementiert. Jedes dieser Issues muss diesen Leitfaden erfüllen, sein Modul nach der Implementierung bewusst in die Modullinie aufnehmen und den eingebauten Schwachpunkt im PR-Abnahmebericht ausdrücklich benennen.
