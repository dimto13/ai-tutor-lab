# 09 — Glossar

Verbindliche Begriffe. Modelle und Mitarbeitende sollen dieselben Wörter benutzen.

## Plattformbegriffe

| Begriff                      | Bedeutung                                                                    | Nicht verwechseln mit                  |
| ---------------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| **Technology**               | Werkzeugklasse als Lernziel (IDE, AI Coding Assistant …)                     | Product                                |
| **Provider**                 | Hersteller (Microsoft, GitHub, Anthropic …)                                  | Technology                             |
| **Product**                  | Konkretes Werkzeug (VS Code, Copilot, Claude Code)                           | Runtime                                |
| **Runtime / RuntimeAdapter** | Technische Umsetzung, in der gearbeitet wird (Simulator oder echte Umgebung) | Product                                |
| **Capability**               | Fähigkeit einer Runtime (`terminal`, `editor` …)                             | Feature                                |
| **Curriculum**               | Lernpfad einer Rolle                                                         | Course                                 |
| **Course**                   | Zusammenhängender Kurs                                                       | Module                                 |
| **Module**                   | Kleinste Lerneinheit mit genau einer Lernachse                               | Scenario                               |
| **Scenario**                 | Durchführbare Übung in einem Modus                                           | Step                                   |
| **Step**                     | Einzelner Trainingsschritt                                                   | Event                                  |
| **LearningLayer**            | `tool` / `concept` / `ai_workflow`                                           | TrainingMode                           |
| **TrainingMode**             | `explore` / `guided` / `challenge`                                           | LearningLayer                          |
| **UiTargetRef**              | Semantische UI-Referenz (`vscode.activityBar.explorer`)                      | CSS-Selektor                           |
| **TrainingEvent**            | Ereignis aus der Runtime                                                     | Nutzeraktion im UI der Shell           |
| **near-miss**                | Fast richtige Nutzeraktion, erzeugt Feedback                                 | Fehler / irrelevantes Event            |
| **Attestation**              | Kompetenznachweis mit Gültigkeit                                             | Zertifikat im rechtlichen Sinne        |
| **SP (Skill Points)**        | Kompetenzwährung                                                             | Spielpunkte                            |
| **ClassificationScheme**     | Mandantenspezifische Vertraulichkeitsstufen + Merkmale + KI-Freigabematrix   | gesetzliche Geheimhaltungsgrade        |
| **Indicator**                | Merkmal, das eine Mindeststufe auslöst                                       | Suchbegriff                            |
| **Dokumenten-Check**         | Prüfwerkzeug in der Mandanten-Boundary für echte Dokumente                   | Lernmodul mit synthetischen Dokumenten |
| **Mandanten-Boundary**       | Dedizierte, von der Firma verwaltete Umgebung (DB, Speicher, Konto)          | logische Trennung in geteilter DB      |

## Fachbegriffe für Lernende (Kurzform aus dem Content-Glossar)

| Begriff                                                    | Einfache Erklärung                                                                                                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code**                                                   | Genaue, schriftliche Arbeitsanweisungen für einen Computer; eine Excel-Formel ist ein vertrautes Beispiel                                                        |
| **Programmierung**                                         | Eine Aufgabe in eindeutige, prüfbare Schritte zerlegen und diese als Code aufschreiben                                                                           |
| **Python**                                                 | Eine Programmiersprache mit gut lesbaren Regeln; Dateien mit der Endung `.py` enthalten Python-Code                                                              |
| **Workspace**                                              | Der Arbeitskontext von VS Code: ein oder mehrere Ordner plus eigene Einstellungen, Empfehlungen und Konfigurationen                                              |
| **Ordner öffnen**                                          | Einen einzelnen Ordner als Arbeitskontext öffnen; er verhält sich in VS Code bereits als einfacher Single-Folder-Workspace                                       |
| **Repository**                                             | Ein Projekt inklusive seiner vollständigen Änderungsgeschichte                                                                                                   |
| **Working Tree**                                           | Die Dateien, wie sie gerade auf der Festplatte liegen                                                                                                            |
| **Stage / Index**                                          | Der Zwischenbereich: Änderungen, die in den nächsten Commit sollen                                                                                               |
| **Commit**                                                 | Ein gespeicherter Stand mit Beschreibung, Zeitpunkt und Urheber                                                                                                  |
| **Branch**                                                 | Eine parallele Entwicklungslinie                                                                                                                                 |
| **Extension**                                              | Erweiterung, die VS Code zusätzliche Fähigkeiten gibt                                                                                                            |
| **Prompt**                                                 | Die Anweisung, die man einer KI gibt                                                                                                                             |
| **Kontext**                                                | Alles, was die KI zusätzlich zur Anweisung kennt (offene Datei, Auswahl, Projekt)                                                                                |
| **Inline-Vorschlag**                                       | Vorschlag, der direkt beim Tippen im Editor erscheint                                                                                                            |
| **Agent-Modus**                                            | KI führt mehrere Schritte selbstständig aus, statt nur Text vorzuschlagen                                                                                        |
| **Öffentlich / Intern / Vertraulich / Streng vertraulich** | Aufsteigende Vertraulichkeitsstufen: frei teilbar → nur firmenintern → nur berechtigter Personenkreis → strengster Schutz (z. B. Gehälter, Geschäftsgeheimnisse) |
| **Freigabematrix**                                         | Tabelle, die je KI-Werkzeug zeigt, bis zu welcher Stufe Dokumente hinein dürfen                                                                                  |

Die ausführliche und maschinenlesbare Quelle liegt in `content/glossary/de.json`. Dort ist jeder
Begriff einer oder mehreren `Technology`-IDs zugeordnet und erhält eine einfache sowie eine
technische Erklärung. Oberflächenbegriffe können zusätzlich mit einem `UiTargetRef` verbunden sein.

## Persona und Begriffsvermittlung

Lernenden-Personas werden als Daten in `content/personas/*.json` gepflegt. Ein Szenario referenziert
die Persona über `audience.personaId` und listet unter `audience.glossaryConcepts` genau die Begriffe,
die im Guide kontextuell als abrufbare Erklärungen erscheinen.

Für proaktive Einführungen gibt es zwei Formen:

- `audience.introductionStepRefs` referenziert wiederverwendbare Erklärungsschritte aus
  `content/introductions/de.json`. Der Content-Loader stellt diese bei Guided-Szenarien vor die
  szenariospezifischen Schritte und leitet daraus die effektiven `introductionStepIds` ab.
- `audience.introductionStepIds` kennzeichnet lokale, direkt im Szenario definierte optionale
  Erklärungsschritte. Diese bleiben für szenariospezifische Grundlagen und bestehende Inhalte erhalten.

Gemeinsame und lokale Einführungsschritte bilden zusammen einen zusammenhängenden optionalen Block am
Anfang eines Guided-Szenarios. Der aktuelle Einstieg für programmiernahe Grundlagen verwendet die
Persona `non-programmer`: Office-Erfahrung und einfache Excel-Formeln werden vorausgesetzt,
Programmiererfahrung dagegen nicht.

Die Verantwortungsgrenze ist verbindlich:

- **Proaktive Einführung ist Content.** Optionale Erklärungsschritte führen notwendige Begriffe vor
  ihrer ersten praktischen Verwendung ein. Erfahrene Lernende können den zusammenhängenden
  Einführungsblock ausdrücklich überspringen.
- **Reaktive Erklärung ist Tutor-Funktion.** Rückfragen wie „Was ist ein Workspace?“ werden aus
  demselben Glossar deterministisch beantwortet. Der Tutor erfindet keine zusätzlichen
  Bedienhandlungen und ersetzt nicht die Einführungssequenz.

## Sprachregel für Produktoberflächen

Lerntexte und die sichtbare Produktoberfläche haben unterschiedliche Aufgaben: Der Guide erklärt auf
Deutsch, die Simulation bildet die tatsächlichen Produktlabels ab. Deshalb gilt pro Modul ein
verbindlicher Einführungs- und Wiederholungsvertrag.

1. Hat ein Oberflächenbegriff eine tragfähige deutsche Entsprechung, wird er beim ersten fachlich
   notwendigen Auftreten als `Deutsch (English UI label)` eingeführt, zum Beispiel
   `Bereich (Panel)`, `Ansicht (View)`, `Probleme (Problems)`, `Ausgabe (Output)` oder
   `Einstellungen (Settings)`.
2. Nach dieser ersten Einführung darf im selben Modul die kurze deutsche Form verwendet werden,
   solange sie eindeutig bleibt. Die englische Klammer wird nicht in jedem Schritt wiederholt.
3. Sichtbare Menüpunkte, Schaltflächen, Befehle, Dateinamen und Tastenkürzel bleiben in konkreten
   Handlungsanweisungen exakt so geschrieben, wie sie im Produkt erscheinen, zum Beispiel
   `Terminal → New Terminal`, `File → Open Folder...`, `Problems`, `Output` oder `Strg+S`.
4. Eigennamen und etablierte Produktbegriffe ohne tragfähige deutsche Hauptbezeichnung bleiben
   `English (deutsche Erklärung)`, zum Beispiel `Command Palette (Befehlspalette)` oder
   `Activity Bar (Aktivitätsleiste)`. Produktnamen wie `Visual Studio Code` und `GitHub Copilot`
   werden nicht übersetzt.
5. Im Content-Glossar steht bei übersetzbaren UI-Begriffen die deutsche Form in `term`; das originale
   englische UI-Label bleibt in `aliases`. Bei Produkt-/Eigennamen gilt die umgekehrte Reihenfolge.
   Dadurch kann der Matcher beide Schreibweisen erkennen; die Klammerform erzeugt kein zweites Konzept.
6. Die Klammererklärung wird pro Modul beim ersten fachlichen Auftreten gesetzt. Wiederverwendbare
   Introduction-Steps zählen als diese Einführung; nachfolgende Guided-Schritte dürfen die kurze
   deutsche Form verwenden. Explore-Szenarien ohne Introduction-Block führen die Begriffe im eigenen
   Einstieg ein.
7. Gibt es keinen sinnvollen Office-Gegenpart, wird das ausdrücklich gesagt. Analogien sollen das
   Verständnis erleichtern und keine fachlich falsche Gleichsetzung erzeugen.
