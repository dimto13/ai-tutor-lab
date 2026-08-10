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
| **Activity Bar**                                           | Schmale Navigation ganz links; ähnlich der Navigationsleiste in Outlook wählt sie den Hauptbereich aus                                                           |
| **Side Bar**                                               | Inhaltsbereich neben der Activity Bar; ähnlich dem Navigationsbereich in Word zeigt sie den Inhalt der gewählten Funktion                                        |
| **View**                                                   | Spezialisierte Ansicht innerhalb von Side Bar oder Panel, vergleichbar mit einem eingeblendeten Navigations- oder Aufgabenbereich in Office                       |
| **Explorer**                                               | Datei- und Ordnerübersicht des Arbeitskontexts; ähnlich Windows Explorer oder dem Office-Dialog „Öffnen“                                                         |
| **Editor**                                                 | Zentrale Arbeitsfläche für Dateiinhalt; vergleichbar mit Dokumentbereich in Word oder Arbeitsblatt in Excel                                                      |
| **Panel**                                                  | Zusätzlicher Werkzeug- und Informationsbereich, meist unter dem Editor                                                                                            |
| **Terminal**                                               | Textbasierte Befehlsansicht ohne direkten Office-Gegenpart; Befehle sind eindeutige Arbeitsanweisungen ähnlich dem Grundprinzip einer Excel-Formel                 |
| **Status Bar**                                             | Kompakte Zustandsanzeige am unteren Rand, vergleichbar mit der Statusleiste in Word oder Excel                                                                    |
| **Workspace**                                              | Der Arbeitskontext von VS Code: ein oder mehrere Ordner plus eigene Einstellungen, Empfehlungen und Konfigurationen                                              |
| **Ordner öffnen**                                          | Nur ein Verzeichnis öffnen — ohne Workspace-Einstellungen                                                                                                        |
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

Bei sichtbaren UI-Bezeichnungen bleibt der originale Produktbegriff die Referenz. Die deutsche
Erklärung dient der Einordnung, darf aber keine zweite konkurrierende Bezeichnung etablieren.

1. Beim ersten notwendigen Auftreten wird der originale UI-Begriff mit einer kurzen deutschen
   Erklärung verbunden, zum Beispiel `File (Datei)` oder `Activity Bar (linke Navigationsleiste)`.
2. Danach wird im selben Lernkontext konsequent der originale UI-Begriff verwendet, insbesondere in
   Handlungsanweisungen, damit Text und sichtbare Oberfläche übereinstimmen.
3. Sichtbare Menüpunkte und Schaltflächen werden nicht durch frei erfundene deutsche Produktnamen
   ersetzt. Die Erklärung beschreibt die Funktion, nicht eine vermeintliche offizielle Übersetzung.
4. Gibt es keinen sinnvollen Office-Gegenpart, wird das ausdrücklich gesagt. Die Analogie soll das
   Verständnis erleichtern und keine fachlich falsche Gleichsetzung erzeugen.
