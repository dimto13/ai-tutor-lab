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

Diese Tabelle ist die Quelle für `AITP-93` und für Tutor-Stufe 1. Jeder Begriff bekommt dort
zusätzlich eine Vertiefung und eine Verknüpfung zu einem `UiTargetRef`, damit er im
Explore-Modus anklickbar ist.
