# 06 — Backlog

> **Generiert aus `backlog/backlog.yaml`. Nicht direkt bearbeiten.**
> Stand 2026-08-08 · 73 Tickets in 13 Epics · 436 Story Points gesamt

## Überblick

| Epic | Titel | Tickets | Punkte | Must |
|---|---|---:|---:|---:|
| EP-01 | Domänenmodell & Technology-Katalog | 3 | 13 | 2 |
| EP-02 | Training Engine | 7 | 37 | 7 |
| EP-03 | Runtime-Adapter & Simulatoren | 8 | 65 | 6 |
| EP-04 | Trainingsmodi Explore / Guided / Challenge | 4 | 24 | 3 |
| EP-05 | Guide-Panel, Overlay & Hilfesystem | 5 | 26 | 4 |
| EP-06 | KI-Tutor | 4 | 21 | 2 |
| EP-07 | Punktesystem, Kompetenzprofil & Nachweise | 6 | 27 | 5 |
| EP-08 | Dashboard, Reporting & Rollen | 4 | 23 | 1 |
| EP-09 | Plattform, Auth, Persistenz & Deployment | 6 | 32 | 5 |
| EP-10 | Content-Authoring & Szenariokatalog | 7 | 50 | 4 |
| EP-11 | Compliance, Datenschutz & Barrierefreiheit | 5 | 24 | 3 |
| EP-12 | Qualitätssicherung & Lernanalytik | 5 | 26 | 3 |
| EP-13 | Datenklassifizierung & Dokumenten-Check | 9 | 68 | 4 |

## Verteilung nach Meilenstein

| Meilenstein | Tickets | Punkte |
|---|---:|---:|
| M1 | 23 | 136 |
| M2 | 22 | 134 |
| M3 | 14 | 77 |
| M4 | 11 | 71 |
| M5 | 3 | 18 |

---

## EP-01 — Domänenmodell & Technology-Katalog

*Ziel: Lerninhalt und Technologie sauber trennen, Generizität strukturell verankern*

### AITP-1 — Technology-Katalog als Datenmodell einführen

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M1 · **Anforderungen** FR-01, FR-02

Technology, Provider, Product, ProductVersion, Capability und Integration als typisierte Datenstrukturen in packages/catalog anlegen. Initial befüllt mit Microsoft/VS Code, GitHub/Copilot und einem zweiten Provider.

**Akzeptanzkriterien**

- [ ] Katalog liegt als JSON/YAML mit TypeScript-Typen und Schema vor
- [ ] GitHub Copilot ist als Integration mit hostProductId vscode modelliert
- [ ] Kein Hersteller taucht als Dateiname in der Codestruktur auf
- [ ] Katalog ist ohne Frontend-Build ladbar und testbar

### AITP-2 — Lerninhaltshierarchie Curriculum/Course/Module/Scenario/Step modellieren

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M1 · **Anforderungen** FR-03, FR-05

Fünfstufige Inhaltshierarchie einführen. Jedes Modul erhält genau eine learningLayer (tool, concept, ai_workflow). Szenarien referenzieren die Umgebung nur über environment.productId/version/runtimeAdapterId.

**Akzeptanzkriterien**

- [ ] Typen entsprechen docs/02-domaenenmodell.md §2.3
- [ ] Ein Szenario enthält keinerlei React- oder DOM-Bezug
- [ ] Bestehender Git/Copilot-Kurs ist in dieser Struktur abbildbar

### AITP-3 — Lernziele (LearningObjective) als eigenständige, referenzierbare Entität

**Typ** story · **Priorität** Should · **Schätzung** 3 SP · **Meilenstein** M2 · **Anforderungen** FR-06 · **Abhängig von** AITP-2

Lernziele modulübergreifend definieren, damit Nachweise und Curricula auf Zielen statt auf Szenario-IDs beruhen.

**Akzeptanzkriterien**

- [ ] Lernziele haben stabile IDs und Beschreibungen
- [ ] Szenarien referenzieren nur existierende Lernziele (CI-Prüfung)
- [ ] Ein Lernziel kann von mehreren Modulen adressiert werden

---

## EP-02 — Training Engine

*Ziel: Frameworkfreie State Machine, Events, Validierung, ohne UI-Abhängigkeit*

### AITP-10 — Training Engine als eigenes Package ohne UI-Abhängigkeit

**Typ** story · **Priorität** Must · **Schätzung** 8 SP · **Meilenstein** M1 · **Anforderungen** FR-10, FR-18, NFR-07

packages/training-engine mit State Machine, Event Bus, Validator Registry und Session-Handling. Keine Abhängigkeit zu React, DOM oder Tailwind.

**Akzeptanzkriterien**

- [ ] Engine läuft in Node ohne Browser
- [ ] Zustände NOT_STARTED, ACTIVE, VALIDATION_FAILED, COMPLETED, SKIPPED implementiert
- [ ] Genau ein Schritt kann ACTIVE sein (per Test abgesichert)
- [ ] package.json enthält keine UI-Abhängigkeit

### AITP-11 — Deklarative Validatoren implementieren

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M1 · **Anforderungen** FR-12 · **Abhängig von** AITP-10

Validator-Typen event, state, sequence, all, any gemäß Domänenmodell. Registry-basiert, damit neue Validatortypen ohne Engine-Änderung ergänzt werden können.

**Akzeptanzkriterien**

- [ ] Alle fünf Typen mit Unit-Tests abgedeckt
- [ ] Ein neuer Validatortyp ist ohne Änderung der State Machine registrierbar

### AITP-12 — Beinahe-Treffer-Erkennung (pass / near-miss / ignore)

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M1 · **Anforderungen** FR-13 · **Abhängig von** AITP-11

Validatoren liefern dreiwertiges Ergebnis. Nur near-miss erzeugt eine Fehlermeldung im Guide-Panel, damit Nutzer nicht bei jeder beliebigen Aktion getadelt werden. Beispiel: file.created mit falschem Namen = near-miss, editor.selection.changed = ignore.

**Akzeptanzkriterien**

- [ ] Falscher Dateiname erzeugt die konfigurierte onFailure-Meldung
- [ ] Irrelevante Events erzeugen keinerlei Nutzerfeedback
- [ ] Fehlversuche werden gezählt, kosten aber keine Punkte

### AITP-13 — Endzustands-Validierung für den Challenge-Modus

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M2 · **Anforderungen** FR-14 · **Abhängig von** AITP-11, AITP-22

Im Challenge-Modus prüft die Engine per adapter.query() den Zielzustand statt der Event-Reihenfolge. Der Lösungsweg bleibt dem Nutzer überlassen.

**Akzeptanzkriterien**

- [ ] Ein Challenge-Szenario ist auf mindestens zwei unterschiedlichen Wegen lösbar
- [ ] Kein Schritt erzwingt eine bestimmte Klickreihenfolge

### AITP-14 — Session-Persistenz und exakte Wiederaufnahme

**Typ** story · **Priorität** Must · **Schätzung** 8 SP · **Meilenstein** M2 · **Anforderungen** FR-15, NFR-04 · **Abhängig von** AITP-10, AITP-84

Fortschritt, Runtime-Snapshot, genutzte Hinweise und Fehlversuche persistieren. Zunächst LocalStorage, ab M2 serverseitig mit LocalStorage als Offline-Puffer.

**Akzeptanzkriterien**

- [ ] Nach Browser-Neustart wird derselbe Schritt mit demselben Workspace-Zustand angezeigt
- [ ] Wechsel des Geräts stellt den Serverstand her
- [ ] Konflikt lokal/server wird deterministisch aufgelöst (jüngster Serverstand gewinnt)

### AITP-15 — Einheitliches TrainingEvent-Format und Event Bus

**Typ** story · **Priorität** Must · **Schätzung** 3 SP · **Meilenstein** M1 · **Anforderungen** FR-11

TrainingEvent mit id, source, type, timestamp, sessionId, payload. Bus als In-Process-Implementierung hinter einem Interface, damit später WebSocket-Transport ohne Änderung der Konsumenten möglich ist.

**Akzeptanzkriterien**

- [ ] Kanonische Event-Typen aus dem Domänenmodell sind als Union-Typ definiert
- [ ] Der Bus ist hinter einem Interface gekapselt (Transport austauschbar)
- [ ] Jedes Event geht zusätzlich an eine Telemetrie-Senke

### AITP-16 — Fortschritt nicht mehr über Weiter-Button auslösen

**Typ** chore · **Priorität** Must · **Schätzung** 3 SP · **Meilenstein** M1 · **Anforderungen** FR-11 · **Abhängig von** AITP-10

Bestehende POC-Logik prüfen und alle Stellen entfernen, an denen ein Schritt allein durch einen Weiter-Button abgeschlossen wird. Ausnahme: reine Lese-/Erklärschritte.

**Akzeptanzkriterien**

- [ ] Jeder Handlungsschritt wird ausschließlich durch ein Runtime-Event abgeschlossen
- [ ] Erklärschritte sind explizit als solche markiert

---

## EP-03 — Runtime-Adapter & Simulatoren

*Ziel: Einheitliches Adapter-Interface, realistischer VS-Code- und Terminal-Simulator*

### AITP-20 — RuntimeAdapter-Interface definieren

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M1 · **Anforderungen** FR-30, FR-35

packages/runtime-core mit dem Interface aus docs/02 §2.3: mount, unmount, subscribe, query, resolveTarget, describeSurface, snapshot, restore.

**Akzeptanzkriterien**

- [ ] Interface ist dokumentiert und typisiert
- [ ] Eine gemeinsame Contract-Testsuite existiert, gegen die jeder Adapter läuft
- [ ] Kein Adapter importiert die Training Engine

### AITP-21 — VS-Code-Simulator auf korrekte Informationsarchitektur ausbauen

**Typ** story · **Priorität** Must · **Schätzung** 13 SP · **Meilenstein** M1 · **Anforderungen** FR-31 · **Abhängig von** AITP-20

Der Simulator muss nicht nur ähnlich aussehen, sondern die Struktur korrekt vermitteln: Menüleiste (File/Edit/Selection/View/Go/Run/Terminal/Help), Activity Bar, Side Bar mit Explorer/Search/Source Control/Extensions, Editor mit Tabs, Panel mit Terminal/Problems/ Output, Statusleiste mit Branch und Interpreter.

**Akzeptanzkriterien**

- [ ] Alle genannten Bereiche sind vorhanden und benennbar
- [ ] Menüleiste ist aufklappbar und enthält die für die Szenarien nötigen Einträge
- [ ] Panel-Tabs Terminal, Problems, Output sind umschaltbar
- [ ] Statusleiste zeigt Branch und Sprachumgebung

### AITP-22 — Workspace- vs. Ordner-Konzept im Simulator abbilden

**Typ** story · **Priorität** Must · **Schätzung** 8 SP · **Meilenstein** M1 · **Anforderungen** FR-32 · **Abhängig von** AITP-21

Ordner öffnen und Workspace öffnen sind unterschiedliche Vorgänge mit unterschiedlichen Folgen (Mehrordner, Workspace-Einstellungen, Extension-Empfehlungen). Genau dieses Konzept fehlt unerfahrenen Nutzern am häufigsten.

**Akzeptanzkriterien**

- [ ] Beide Vorgänge sind im Simulator durchführbar und unterscheidbar
- [ ] Ein Workspace kann mehrere Ordner enthalten
- [ ] Workspace-Einstellungen sind sichtbar (auch wenn nur exemplarisch)
- [ ] Zugehörige Events (workspace.opened, folder.opened) werden emittiert

### AITP-23 — Terminal-Simulator mit deterministischer Kommandoerkennung

**Typ** story · **Priorität** Must · **Schätzung** 8 SP · **Meilenstein** M1 · **Anforderungen** FR-33 · **Abhängig von** AITP-20

Kommandotabelle mit Ausgaben, inklusive Fehlerfällen (unbekannter Befehl, git commit ohne Staging, Tippfehler). Fehlerfälle sind didaktisch wertvoll und dürfen nicht fehlen.

**Akzeptanzkriterien**

- [ ] git status, git add, git commit, ls, cd, python liefern realistische Ausgaben
- [ ] Mindestens drei Fehlerfälle mit hilfreicher Originalfehlermeldung
- [ ] Kommandos werden als terminal.command.executed emittiert
- [ ] Ausgabe hängt vom Zustand des Dateisystems im Simulator ab, nicht von einer Skriptfolge

### AITP-24 — Copilot-Simulation als eigenständiger Adapter innerhalb von VS Code

**Typ** story · **Priorität** Must · **Schätzung** 8 SP · **Meilenstein** M2 · **Anforderungen** FR-02, FR-34 · **Abhängig von** AITP-21

GitHub Copilot wird nicht Teil des VS-Code-Simulators, sondern als eigenes Produkt mit Integration hostProductId=vscode modelliert. Abgedeckt: Chat, Inline-Vorschläge, Kontextverständnis, Ansatz Agent-Modus sowie die für Lerninhalte benötigten produktversionsabhängigen Chat-Sitzungen und Modellauswahl.

**Akzeptanzkriterien**

- [ ] Copilot ist im VS-Code-Simulator ein- und ausschaltbar
- [ ] Inline-Vorschlag kann angenommen oder abgelehnt werden (ai.suggestion.accepted/rejected)
- [ ] Chat kennt den geöffneten Dateikontext
- [ ] Eine neue Copilot-Unterhaltung kann begonnen werden; der simulierte Gesprächskontext wird dabei deterministisch neu aufgebaut
- [ ] Modellwahl einschließlich Auto-/Standardauswahl ist über semantische UiTargetRefs erreichbar; angebotene Optionen stammen aus versionierten Produktdaten
- [ ] Derselbe VS-Code-Simulator funktioniert auch ohne Copilot

### AITP-25 — Zweiten Technologie-Prototyp als Generizitätsbeweis

**Typ** story · **Priorität** Must · **Schätzung** 13 SP · **Meilenstein** M2 · **Anforderungen** FR-34, NFR-07 · **Abhängig von** AITP-20, AITP-10

Ein zweites Produkt als eigener Adapter, empfohlen Claude Code (CLI-Agent) oder M365 Copilot (Office Assistant). Zweck ist nicht ein vollständiger Kurs, sondern der Nachweis, dass Engine, Overlay, Tutor und Punkte unverändert funktionieren.

**Akzeptanzkriterien**

- [ ] Adapter implementiert dasselbe Interface und besteht die Contract-Tests
- [ ] Ein Mini-Szenario mit mindestens vier Schritten läuft vollständig durch
- [ ] Für die Umsetzung war keine Änderung an packages/training-engine nötig (per Diff belegt)

### AITP-26 — Snapshot/Restore je Adapter

**Typ** story · **Priorität** Should · **Schätzung** 5 SP · **Meilenstein** M2 · **Anforderungen** FR-36 · **Abhängig von** AITP-20

Serialisierbarer Laufzeitzustand als Grundlage für exakte Wiederaufnahme.

**Akzeptanzkriterien**

- [ ] Dateibaum, offene Tabs, Editorinhalte, Terminalhistorie und Git-Zustand werden erfasst
- [ ] Restore stellt den Zustand vollständig wieder her

### AITP-27 — Spike - Machbarkeit und Kosten echter Runtime (code-server)

**Typ** spike · **Priorität** Could · **Schätzung** 5 SP · **Meilenstein** M4 · **Anforderungen** FR-37

Untersuchen, ob code-server hinter demselben RuntimeAdapter-Interface betreibbar ist (Event-Erfassung, Zustandsabfrage, Zielauflösung im iFrame) und was eine aktive Sitzung real kostet. Ergebnis entscheidet ADR-01.

**Akzeptanzkriterien**

- [ ] Prototyp mit einem eingebetteten code-server, mindestens ein Event erfasst
- [ ] Belastbare Kostenschätzung pro aktiver Nutzerstunde
- [ ] Klare Aussage, ob resolveTarget im iFrame umsetzbar ist
- [ ] Schriftliche Empfehlung zur Hybrid-Strategie

---

## EP-04 — Trainingsmodi Explore / Guided / Challenge

*Ziel: Didaktische Tiefe statt reiner Klickstrecke*

### AITP-30 — Trainingsmodi als generisches Konzept einführen

**Typ** story · **Priorität** Must · **Schätzung** 8 SP · **Meilenstein** M1 · **Anforderungen** FR-20, FR-21, FR-22, FR-23 · **Abhängig von** AITP-10

mode als Eigenschaft des Szenarios; Engine, Guide-Panel, Overlay, Tutor und Scoring verhalten sich modusabhängig.

**Akzeptanzkriterien**

- [ ] Alle drei Modi sind auswählbar und wirken sich sichtbar auf die Führung aus
- [ ] Der Modus bestimmt den Punkte-Multiplikator
- [ ] Ein Modul kann mehrere Modi anbieten

### AITP-31 — Explore-Modus - freie Inspektion der Oberfläche

**Typ** story · **Priorität** Must · **Schätzung** 8 SP · **Meilenstein** M1 · **Anforderungen** FR-20 · **Abhängig von** AITP-21, AITP-30

Der Nutzer klickt frei auf Oberflächenbereiche; das System erklärt jedes Element über describeSurface() und den Begriffskatalog. Fortschritt = Anteil erkundeter Elemente.

**Akzeptanzkriterien**

- [ ] Jedes von describeSurface gemeldete Element liefert eine Erklärung
- [ ] Erkundungsfortschritt ist sichtbar
- [ ] Kein Zeitdruck, keine Fehlermeldungen in diesem Modus

### AITP-32 — Challenge-Modus - Aufgabe ohne Schritt-für-Schritt-Führung

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M2 · **Anforderungen** FR-22 · **Abhängig von** AITP-13, AITP-30

Nur Zielbeschreibung und Erfolgskriterien, kein Overlay, Tutor nur auf ausdrückliche Anfrage, Hinweise reduzieren den Bonus.

**Akzeptanzkriterien**

- [ ] Keine automatischen Hinweise oder Highlights
- [ ] Erfolg wird über Endzustand geprüft
- [ ] Nach Abschluss wird ein Lösungsvergleich angeboten

### AITP-33 — Einstiegsempfehlung und Überspringen für erfahrene Nutzer

**Typ** story · **Priorität** Should · **Schätzung** 3 SP · **Meilenstein** M3 · **Anforderungen** FR-24 · **Abhängig von** AITP-32

Vorkenntnisabfrage oder Direkteinstieg in Challenge; bei Scheitern sanfte Rückführung in den Guided-Modus.

**Akzeptanzkriterien**

- [ ] Nutzer kann Guided überspringen
- [ ] Nach zwei gescheiterten Challenge-Versuchen wird Guided vorgeschlagen, nicht erzwungen

---

## EP-05 — Guide-Panel, Overlay & Hilfesystem

*Ziel: Visuelle Führung, die nie falsch markiert und nie überfordert*

### AITP-40 — Overlay-Engine auf semantische Zielreferenzen umstellen

**Typ** story · **Priorität** Must · **Schätzung** 8 SP · **Meilenstein** M1 · **Anforderungen** FR-40, FR-41 · **Abhängig von** AITP-20

Szenarien geben nur UiTargetRef an; die Auflösung nach DOMRect erfolgt ausschließlich im Adapter. Keine CSS-Selektoren in Szenariodaten.

**Akzeptanzkriterien**

- [ ] Kein Szenario enthält einen CSS-Selektor oder DOM-Bezug
- [ ] Abdunkelung mit Aussparung, Zielelement bleibt klickbar
- [ ] Position folgt Resize und Scroll
- [ ] Nicht auflösbares Ziel führt zu Textanweisung statt falscher Markierung

### AITP-41 — Dreistufiges Hilfesystem mit Protokollierung

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M1 · **Anforderungen** FR-42 · **Abhängig von** AITP-40

Stufe 1 Hinweis, Stufe 2 konkrete Anweisung, Stufe 3 visuelle Hervorhebung. Jede Nutzung wird erfasst, um später den tatsächlichen Unterstützungsbedarf auszuwerten.

**Akzeptanzkriterien**

- [ ] Stufen werden einzeln und in Reihenfolge abgerufen
- [ ] Nutzung wird je Schritt gespeichert
- [ ] Auswirkung auf den Bonus ist vor dem Abruf transparent angezeigt

### AITP-42 — Guide-Panel auf die fünf Orientierungsfragen ausrichten

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M1 · **Anforderungen** FR-43

Das Panel beantwortet jederzeit sichtbar - Wo bin ich, was soll ich tun, warum, war meine Aktion erfolgreich, was kommt als Nächstes.

**Akzeptanzkriterien**

- [ ] Alle fünf Informationen sind ohne Scrollen erkennbar
- [ ] Erfolgsrückmeldung erscheint innerhalb von 300 ms nach Validierung
- [ ] Der Warum-Text stammt aus step.rationale und ist optional aufklappbar

### AITP-43 — Fehlerverhalten und Beinahe-Treffer-Feedback im Panel

**Typ** story · **Priorität** Must · **Schätzung** 3 SP · **Meilenstein** M1 · **Anforderungen** FR-13 · **Abhängig von** AITP-12

Bei near-miss erscheint die konfigurierte Meldung, optional wird das falsche Element markiert. Ton ist unterstützend, nicht tadelnd.

**Akzeptanzkriterien**

- [ ] Falscher Dateiname erzeugt die Meldung aus onFailure
- [ ] Optionales Markieren des falschen Elements funktioniert
- [ ] Nach drei Fehlversuchen wird die nächste Hilfestufe aktiv angeboten

### AITP-44 — Sprachausgabe für Guide- und Erklärungstexte

**Typ** story · **Priorität** Should · **Schätzung** 5 SP · **Meilenstein** M4 · **Anforderungen** NFR-08 · **Abhängig von** AITP-42, AITP-95

Guide- und Erklärungstexte können zusätzlich zum sichtbaren Text auf ausdrückliche Nutzeraktion vorgelesen werden. Die Sprachausgabe ist eine optionale Darstellungsform derselben Content-Quelle; es gibt keine separat gepflegte Audio-Textkopie und kein Autoplay.

**Akzeptanzkriterien**

- [ ] Jede dafür freigegebene Guide-/Erklärbox bietet eine per Tastatur bedienbare Play-/Pause-Steuerung
- [ ] Die Sprachausgabe verwendet exakt den aktuell angezeigten Erklärungstext
- [ ] Wiedergabe startet ausschließlich nach Nutzeraktion; es gibt kein Autoplay
- [ ] Beim Wechsel des Trainingsschritts wird eine laufende Wiedergabe sauber beendet oder auf den neuen Inhalt umgestellt
- [ ] Die Sprachausgabe verwendet die aktuell gewählte Content-Sprache und folgt dem Fallback-Verhalten aus AITP-95
- [ ] Die sichtbare Texterklärung bleibt vollständig nutzbar, wenn Sprachausgabe nicht verfügbar oder deaktiviert ist

---

## EP-06 — KI-Tutor

*Ziel: Kontextbewusster Tutor, Stufe 1 deterministisch, Stufe 2 LLM mit Guardrails*

### AITP-50 — Tutor-Kontextobjekt aufbauen

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M1 · **Anforderungen** FR-44 · **Abhängig von** AITP-10

TutorContext mit Szenario, Modus, aktuellem Schritt, abgeschlossenen Schritten, letzten zehn Events, Hinweisnutzung, Fehlversuchen und Zustandszusammenfassung.

**Akzeptanzkriterien**

- [ ] Kontext ist typisiert und wird bei jedem Zustandswechsel aktualisiert
- [ ] Kontext enthält keine personenbezogenen Daten über die Session hinaus

### AITP-51 — Tutor Stufe 1 - deterministische Antworten aus dem Content

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M1 · **Anforderungen** FR-45 · **Abhängig von** AITP-50

Antworten auf Standardfragen (Was soll ich jetzt tun, warum, was bedeutet Begriff X) werden aus rationale, helpLevels und dem Begriffskatalog erzeugt. Kein externes Modell.

**Akzeptanzkriterien**

- [ ] Die Frage "Was soll ich jetzt machen?" liefert immer die korrekte Schrittanweisung
- [ ] Begriffsfragen werden aus dem Glossar beantwortet
- [ ] Funktioniert ohne Netzwerkzugriff auf externe Dienste

### AITP-52 — Tutor Stufe 2 - LLM-Anbindung mit Guardrails

**Typ** story · **Priorität** Should · **Schätzung** 8 SP · **Meilenstein** M3 · **Anforderungen** FR-46 · **Abhängig von** AITP-51, AITP-83

Freie Fragen über einen serverseitigen Proxy. Systemprompt enthält den aktuellen Schritt und die Regel, keine nicht hinterlegten UI-Anweisungen zu erfinden. Handlungsvorschläge müssen auf existierende UiTargetRefs verweisen.

**Akzeptanzkriterien**

- [ ] API-Schlüssel liegen ausschließlich serverseitig
- [ ] Antworten mit erfundenen UI-Elementen werden abgefangen und auf Rückfrage reduziert
- [ ] Nutzercode wird nur bei aktivem Mandanten-Opt-in übertragen
- [ ] Kosten pro Sitzung sind begrenzt und protokolliert

### AITP-53 — Sichtbarkeitsverhalten des Tutor-Panels evaluieren

**Typ** spike · **Priorität** Should · **Schätzung** 3 SP · **Meilenstein** M3 · **Anforderungen** FR-47 · **Abhängig von** AITP-51, AITP-110

Offene Produktfrage aus dem POC - soll der Tutor dauerhaft sichtbar sein? Zwei Varianten im Pilot gegeneinander messen (dauerhaft sichtbar vs. eingeklappt mit Hinweisindikator).

**Akzeptanzkriterien**

- [ ] Beide Varianten sind schaltbar
- [ ] Nutzung, Abschlussquote und Hinweisbedarf werden je Variante ausgewertet
- [ ] Schriftliche Empfehlung liegt vor

---

## EP-07 — Punktesystem, Kompetenzprofil & Nachweise

*Ziel: Motivation als Kompetenzwährung, prüffähige Nachweise*

### AITP-60 — Scoring Engine mit Modus-Multiplikator

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M2 · **Anforderungen** FR-50, FR-51 · **Abhängig von** AITP-14

Basispunkte 70 Prozent, Bonus 30 Prozent. Multiplikator Explore 0,5 / Guided 1,0 / Challenge 2,0. Hinweise reduzieren nur den Bonus, Fehlversuche kosten nichts.

**Akzeptanzkriterien**

- [ ] Berechnung erfolgt serverseitig, nie im Client
- [ ] Hinweisabzüge entsprechen docs/05 §5.2
- [ ] Fehlversuche verändern die Punktzahl nicht
- [ ] Punkteberechnung ist per Unit-Test abgedeckt

### AITP-61 — Anti-Gaming-Regeln

**Typ** story · **Priorität** Must · **Schätzung** 3 SP · **Meilenstein** M2 · **Anforderungen** FR-53 · **Abhängig von** AITP-60

Punkte je Szenario-Version nur einmal, Wiederholung als punktfreie Übung, Markierung auffällig schneller Durchläufe als suspect_fast ohne Anrechnung auf Nachweise.

**Akzeptanzkriterien**

- [ ] Zweiter Durchlauf desselben Szenarios vergibt keine Punkte, wird aber gespeichert
- [ ] Durchläufe unter 25 Prozent der Schätzzeit sind markiert
- [ ] Neue Szenario-Version ist erneut punktefähig

### AITP-62 — Kompetenzprofil je Technology mit Stufen

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M2 · **Anforderungen** FR-52 · **Abhängig von** AITP-60, AITP-1

Punkteaggregation je Technology, Stufen Novice / Advanced Beginner / Practitioner / Proficient. Darstellung als ruhige Kompetenzmatrix, keine Spielelemente.

**Akzeptanzkriterien**

- [ ] Profil zeigt alle Technologien mit Punktestand und Stufe
- [ ] Practitioner erfordert mindestens eine bestandene Challenge
- [ ] Schwellen sind konfigurierbar, nicht hart codiert

### AITP-63 — Kompetenznachweise erzeugen und exportieren

**Typ** story · **Priorität** Must · **Schätzung** 8 SP · **Meilenstein** M3 · **Anforderungen** FR-54, FR-64 · **Abhängig von** AITP-62, AITP-3

Attestation bei Erfüllung aller Modul-Lernziele im Challenge-Modus, mit Produktversion, Nachweisdaten, 12 Monaten Gültigkeit und signiertem PDF/CSV-Export.

**Akzeptanzkriterien**

- [ ] Nachweis enthält Lernziele, Produktversion, Datum, Gültigkeit und Belegdaten
- [ ] Export als PDF und CSV
- [ ] Abgelaufene Nachweise sind als solche gekennzeichnet und lösen eine Re-Zertifizierungsempfehlung aus

### AITP-65 — Abschlussbildschirm mit Auswertung und Anschlussaktion

**Typ** story · **Priorität** Must · **Schätzung** 3 SP · **Meilenstein** M2 · **Anforderungen** FR-56 · **Abhängig von** AITP-60

Schritte, Dauer, Hinweise, Fehlversuche, erzielte Punkte, Kompetenzveränderung und konkreter Vorschlag für das nächste Modul.

**Akzeptanzkriterien**

- [ ] Alle genannten Kennzahlen werden angezeigt
- [ ] Genau eine empfohlene Folgeaktion ist hervorgehoben
- [ ] Wiederholen ist möglich, ohne die bestehende Punktzahl zu gefährden

### AITP-64 — Wöchentliche Lernkontinuität statt Tages-Streaks

**Typ** story · **Priorität** Should · **Schätzung** 3 SP · **Meilenstein** M3 · **Anforderungen** FR-57 · **Abhängig von** AITP-60

Konfigurierbares Wochenziel, Verlauf der letzten acht Wochen, kein Verlustmechanismus, Erinnerungen nur mit Opt-in.

**Akzeptanzkriterien**

- [ ] Wochenziel ist durch die lernende Person einstellbar
- [ ] Keine Abwertung bei Unterbrechung
- [ ] Keine Benachrichtigung ohne ausdrückliche Zustimmung

---

## EP-08 — Dashboard, Reporting & Rollen

*Ziel: Überblick für Lernende und aggregierte Auswertung für L&D*

### AITP-70 — Dashboard "Meine Trainings" auf Kompetenz- statt Kursorientierung umstellen

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M2 · **Anforderungen** FR-60 · **Abhängig von** AITP-62

Neben Kurskarten das Kompetenzprofil und eine klare Empfehlung des nächsten sinnvollen Schritts. Angefangene Trainings sind sofort fortsetzbar.

**Akzeptanzkriterien**

- [ ] Fortsetzen führt exakt an den letzten Stand
- [ ] Kompetenzprofil ist auf der Startseite sichtbar
- [ ] Genau eine empfohlene nächste Aktion pro Nutzer

### AITP-71 — Rollen- und Berechtigungsmodell

**Typ** story · **Priorität** Should · **Schätzung** 5 SP · **Meilenstein** M3 · **Anforderungen** FR-62, FR-65 · **Abhängig von** AITP-83

Rollen Lernende, Autor, Trainer/L&D, Mandanten-Admin mit klar getrennten Sichten und Datenzugriffen.

**Akzeptanzkriterien**

- [ ] Rollen sind serverseitig durchgesetzt, nicht nur in der UI ausgeblendet
- [ ] Trainer sehen keine personenbezogenen Fehlversuchsdaten
- [ ] Mandantenübergreifender Zugriff ist ausgeschlossen und getestet

### AITP-72 — Aggregiertes Reporting für L&D

**Typ** story · **Priorität** Should · **Schätzung** 8 SP · **Meilenstein** M4 · **Anforderungen** FR-63 · **Abhängig von** AITP-71, AITP-110

Abschlussquoten, Abbruchpunkte je Schritt, durchschnittliche Hinweisnutzung, Zeitbedarf - aggregiert ab Mindestgruppengröße.

**Akzeptanzkriterien**

- [ ] Auswertungen erst ab n gleich 5 Personen sichtbar
- [ ] Abbruchpunkte je Schritt identifizierbar (Grundlage für Content-Verbesserung)
- [ ] Export als CSV

### AITP-73 — Zuweisung von Curricula an Gruppen

**Typ** story · **Priorität** Could · **Schätzung** 5 SP · **Meilenstein** M5 · **Anforderungen** FR-67 · **Abhängig von** AITP-71

Pflichtcurricula je Rolle oder Abteilung zuweisen und deren Erfüllung verfolgen.

**Akzeptanzkriterien**

- [ ] Zuweisung an Gruppe möglich
- [ ] Erfüllungsstand je Gruppe sichtbar

---

## EP-09 — Plattform, Auth, Persistenz & Deployment

*Ziel: Vom Prototyp zum betreibbaren AWS-Amplify-MVP*

### AITP-80 — Prototyp-Quellcode in ein eigenes Git-Repository überführen

**Typ** chore · **Priorität** Must · **Schätzung** 3 SP · **Meilenstein** M1

Quellcode aus dem Prototyping-Werkzeug exportieren, Monorepo-Struktur gemäß README anlegen, Linting, Formatierung, TypeScript-Strict-Mode und CI-Pipeline einrichten.

**Akzeptanzkriterien**

- [ ] Repository baut lokal und in CI reproduzierbar
- [ ] TypeScript strict aktiv, keine impliziten any
- [ ] Branch-Schutz und Pull-Request-Pflicht eingerichtet

### AITP-81 — Monorepo-Aufteilung in apps und packages

**Typ** chore · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M1 · **Anforderungen** NFR-07 · **Abhängig von** AITP-80

apps/web, packages/training-engine, runtime-core, runtime-vscode-sim, runtime-terminal-sim, catalog, content/scenarios.

**Akzeptanzkriterien**

- [ ] Abhängigkeitsrichtung wird per Lint-Regel erzwungen (UI darf Engine importieren, nicht umgekehrt)
- [ ] Jedes Package ist einzeln baubar und testbar

### AITP-82 — AWS-Amplify-Hosting einrichten

**Typ** task · **Priorität** Must · **Schätzung** 3 SP · **Meilenstein** M2 · **Abhängig von** AITP-81

Amplify Hosting mit Monorepo-Konfiguration, Branch-Deployments für main und Vorschau, eigener Domain und Basisschutz für die Vorschauumgebung.

**Akzeptanzkriterien**

- [ ] Push auf main deployt automatisch
- [ ] Vorschau-Deployments je Pull Request
- [ ] Vorschauumgebung ist nicht öffentlich zugänglich

### AITP-83 — Authentifizierung mit OIDC-Föderation und lokalem Fallback

**Typ** story · **Priorität** Must · **Schätzung** 8 SP · **Meilenstein** M2 · **Anforderungen** FR-61 · **Abhängig von** AITP-82

Amplify Auth bzw. Cognito mit Vorbereitung auf Föderation zum Firmen-IdP; lokaler Login als Rückfallebene für Pilotnutzer ohne SSO-Anbindung.

**Akzeptanzkriterien**

- [ ] Anmeldung, Abmeldung und Sitzungsverlängerung funktionieren
- [ ] OIDC-Föderation ist konfigurierbar, ohne Codeänderung austauschbar
- [ ] Nutzeridentität ist im Fortschrittsdatenmodell verankert

### AITP-84 — Serverseitige Fortschritts- und Punktepersistenz

**Typ** story · **Priorität** Must · **Schätzung** 8 SP · **Meilenstein** M2 · **Anforderungen** FR-15, FR-65 · **Abhängig von** AITP-83

Datenmodell für Sessions, StepStates, HintUsage, Attempts, SkillProfile und Attestations mit Mandantenschlüssel.

**Akzeptanzkriterien**

- [ ] Jeder Datensatz trägt tenantId und userId
- [ ] Zugriff ist serverseitig auf den eigenen Mandanten begrenzt
- [ ] Migrationen sind versioniert

### AITP-85 — Transportschicht für Events abstrahieren (WebSocket-Vorbereitung)

**Typ** story · **Priorität** Should · **Schätzung** 5 SP · **Meilenstein** M4 · **Abhängig von** AITP-15

Event-Transport hinter ein Interface legen, damit später ein WebSocket-Backend eingesetzt werden kann, ohne Engine oder UI zu ändern.

**Akzeptanzkriterien**

- [ ] In-Process- und Mock-Remote-Transport sind austauschbar
- [ ] Kein Konsument kennt die Transportimplementierung

---

## EP-10 — Content-Authoring & Szenariokatalog

*Ziel: Szenarien erstellbar, validierbar und versionierbar ohne Frontend-Code*

### AITP-90 — JSON-Schema für Szenarien und CI-Validierung

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M1 · **Anforderungen** FR-04, NFR-06 · **Abhängig von** AITP-2, AITP-20

Schema für Scenario/Step inklusive Referenzprüfung - existiert der UiTargetRef im Adapter, existiert das Lernziel im Katalog, ist der Validator wohlgeformt.

**Akzeptanzkriterien**

- [ ] Ungültiges Szenario bricht den CI-Build
- [ ] Nicht existierender UiTargetRef wird als Fehler gemeldet
- [ ] Fehlermeldungen benennen Datei und Pfad

### AITP-91 — Bestehenden Git/VS-Code/Copilot-Kurs auf die neue Architektur migrieren

**Typ** story · **Priorität** Must · **Schätzung** 8 SP · **Meilenstein** M1 · **Anforderungen** FR-03 · **Abhängig von** AITP-90, AITP-10

Die acht POC-Schritte als deklarative Szenariodaten neu abbilden und aus den React-Komponenten entfernen, ohne die bestehende UX zu verschlechtern.

**Akzeptanzkriterien**

- [ ] Keine Szenariodaten mehr in Komponenten
- [ ] Der Ablauf ist für Nutzer identisch oder besser
- [ ] Szenario besteht die Schema-Validierung

### AITP-92 — Modul "VS Code Grundlagen" mit allen drei Modi

**Typ** story · **Priorität** Must · **Schätzung** 13 SP · **Meilenstein** M2 · **Anforderungen** FR-20, FR-21, FR-22, FR-32 · **Abhängig von** AITP-22, AITP-31, AITP-32

Erstes vollständiges Modul der neuen Struktur - Explore (Oberfläche kennenlernen), Guided (Workspace anlegen, Datei erstellen), Challenge (bestehendes Projekt öffnen und Datei anlegen).

**Akzeptanzkriterien**

- [ ] Alle drei Szenarien laufen fehlerfrei durch
- [ ] Ordner-vs-Workspace ist Bestandteil des Lerninhalts
- [ ] Lernziele sind vergeben und nachweisfähig

### AITP-96 — Modul "GitHub Copilot Grundlagen" - Sessions, Kontext und Modellwahl

**Typ** story · **Priorität** Must · **Schätzung** 8 SP · **Meilenstein** M2 · **Anforderungen** FR-20, FR-21, FR-34, FR-45 · **Abhängig von** AITP-24, AITP-90, AITP-93

Eigenständiges Lernmodul zur tatsächlichen Nutzung von GitHub Copilot in VS Code. Vermittelt Chat, Inline-Vorschläge und agentische Interaktion, grenzt Training-Session und Copilot-Unterhaltung klar voneinander ab und erklärt Kontext, neue Unterhaltungen, Modellwahl, Auto-/Standardauswahl sowie aufgabenbezogene Auswahlkriterien. Weiterführende Quellen werden als pflegbare Content-Metadaten hinterlegt; lokale Ollama-Setups sind nicht Bestandteil des Standard-Lernpfads.

**Akzeptanzkriterien**

- [ ] Der Lerninhalt erklärt den Unterschied zwischen Training-Session und Copilot-Unterhaltung eindeutig
- [ ] Nutzer können im Simulator eine neue Copilot-Unterhaltung beginnen und nachvollziehen, welcher Kontext dadurch erhalten bleibt bzw. neu aufgebaut wird
- [ ] Modellwahl und Auto-/Standardauswahl sind über semantische UiTargetRefs im Copilot-Adapter erreichbar
- [ ] Der Kurs erklärt mindestens drei typische Aufgabensituationen und geeignete Kriterien für die Modellwahl, ohne ein universell bestes Modell zu behaupten
- [ ] Verfügbare Modelloptionen werden versioniert aus Content-/Produktdaten bezogen und nicht in UI-Komponenten fest verdrahtet
- [ ] Weiterführende Links sind als pflegbare Content-Metadaten hinterlegt und bevorzugen offizielle Dokumentation bzw. Release-Informationen
- [ ] Das lokale Ollama-Sonder-Setup ist nicht Bestandteil des Standard-Lernpfads
- [ ] Das Szenario besteht die Schema- und Referenzvalidierung aus AITP-90

### AITP-93 — Begriffskatalog (Glossar) als Content-Quelle

**Typ** story · **Priorität** Should · **Schätzung** 3 SP · **Meilenstein** M2 · **Anforderungen** FR-45

Zentrale Begriffsdefinitionen (Workspace, Repository, Working Tree, Stage, Commit, Branch, Extension, Prompt, Kontext), referenzierbar aus Schritten und Tutor.

**Akzeptanzkriterien**

- [ ] Jeder Begriff hat eine einfache Erklärung und eine Vertiefung
- [ ] Tutor beantwortet Begriffsfragen ausschließlich aus dieser Quelle
- [ ] Begriffe sind im Explore-Modus mit UI-Elementen verknüpfbar

### AITP-95 — Mehrsprachigkeit vorbereiten (DE/EN)

**Typ** story · **Priorität** Should · **Schätzung** 5 SP · **Meilenstein** M4 · **Anforderungen** FR-07, NFR-12

Texte aus Komponenten und Content trennen, Sprachdateien einführen und eine während des Trainings erreichbare Sprachauswahl bereitstellen. Initial werden Deutsch und Englisch unterstützt; Deutsch bleibt Fallback für fehlende Übersetzungen. Ein Sprachwechsel darf den Trainingsfortschritt nicht verändern oder zurücksetzen.

**Akzeptanzkriterien**

- [ ] Keine fest verdrahteten Anzeigetexte in Komponenten
- [ ] Szenariotexte sind je Sprache ablegbar
- [ ] Nutzer können Deutsch oder Englisch über einen klar erreichbaren Schalter bzw. ein Dropdown auswählen
- [ ] Ein Sprachwechsel aktualisiert Plattform- und Szenariotexte, ohne den aktuellen Trainingszustand zu verlieren
- [ ] Fehlende Übersetzung fällt sichtbar auf DE zurück

### AITP-94 — Autorenvorschau für Szenarien

**Typ** story · **Priorität** Could · **Schätzung** 8 SP · **Meilenstein** M4 · **Anforderungen** FR-08 · **Abhängig von** AITP-90

Szenario laden, Schritt für Schritt simulieren, Zielauflösung und Validatoren prüfen - ohne Deployment.

**Akzeptanzkriterien**

- [ ] Autor sieht sofort, ob ein Highlight-Ziel auflösbar ist
- [ ] Validatoren sind gegen simulierte Events testbar
- [ ] Kein Frontend-Codewissen erforderlich

---

## EP-11 — Compliance, Datenschutz & Barrierefreiheit

*Ziel: Einführbarkeit im deutschen Unternehmenskontext sicherstellen*

### AITP-100 — Sichtbarkeitsstufen für Punkte und Ranglisten

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M3 · **Anforderungen** FR-55 · **Abhängig von** AITP-71

Drei Stufen pro Mandant - private (Standard), aggregate (ab n gleich 5), named (nur mit dokumentierter Betriebsvereinbarung). Ranglisten standardmäßig deaktiviert.

**Akzeptanzkriterien**

- [ ] Standardkonfiguration eines neuen Mandanten ist private
- [ ] Aggregierte Sichten unterschreiten n gleich 5 nie
- [ ] Umstellung auf named erfordert eine bestätigte Freigabe im Admin-Bereich

### AITP-101 — Transparenzansicht "Diese Daten werden über mich gespeichert"

**Typ** story · **Priorität** Must · **Schätzung** 3 SP · **Meilenstein** M3 · **Anforderungen** NFR-09, NFR-10 · **Abhängig von** AITP-100

Feste Produktseite, die verständlich zeigt, welche Daten erfasst werden, wer sie sieht und wie lange sie gespeichert bleiben.

**Akzeptanzkriterien**

- [ ] Seite ist aus dem Profil direkt erreichbar
- [ ] Enthält Datenkategorien, Empfänger, Aufbewahrungsfristen
- [ ] Export der eigenen Daten ist möglich

### AITP-102 — Aufbewahrungs- und Löschkonzept für Telemetrie

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M3 · **Anforderungen** NFR-09, NFR-10 · **Abhängig von** AITP-84

Roh-Events standardmäßig 90 Tage, danach nur Aggregate. Löschung eines Nutzerkontos entfernt personenbezogene Daten vollständig.

**Akzeptanzkriterien**

- [ ] Automatische Löschung ist implementiert und nachweisbar
- [ ] Kontolöschung entfernt personenbezogene Daten, Aggregate bleiben anonym erhalten
- [ ] Fristen sind pro Mandant konfigurierbar

### AITP-103 — Barrierefreiheit - Tastaturbedienung, Kontraste, Screenreader

**Typ** story · **Priorität** Should · **Schätzung** 8 SP · **Meilenstein** M4 · **Anforderungen** NFR-08

Vollständige Tastaturbedienbarkeit inklusive Overlay und Simulator, ausreichende Kontraste, aussagekräftige Labels, keine ausschließlich farbliche Kodierung.

**Akzeptanzkriterien**

- [ ] Alle Trainingsschritte sind ohne Maus abschließbar
- [ ] Overlay-Hinweise werden von Screenreadern angesagt
- [ ] Automatisierte Prüfung (axe) ohne kritische Befunde
- [ ] Highlight ist nie die einzige Informationsquelle

### AITP-104 — Rechtliche Prüfung Nachweise und Mitbestimmung

**Typ** task · **Priorität** Should · **Schätzung** 3 SP · **Meilenstein** M3 · **Anforderungen** FR-54, FR-55

Externe Prüfung, wie Kompetenznachweise gegenüber der KI-Kompetenz-Anforderung des EU AI Act positioniert werden dürfen und welche Betriebsvereinbarung Kunden benötigen. Ergebnis - Musterformulierung und Muster-Betriebsvereinbarung als Vertriebsunterlage.

**Akzeptanzkriterien**

- [ ] Schriftliche Einschätzung liegt vor
- [ ] Produktkommunikation ist entsprechend angepasst
- [ ] Muster-Betriebsvereinbarung liegt als Anlage bei

---

## EP-12 — Qualitätssicherung & Lernanalytik

*Ziel: Technische Qualität und didaktische Wirksamkeit messbar machen*

### AITP-110 — Telemetrie- und Lernanalytik-Pipeline

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M3 · **Anforderungen** NFR-10, FR-63 · **Abhängig von** AITP-15, AITP-84

Events gepuffert erfassen und auswertbar ablegen - Abbruchpunkte, Hinweisnutzung, Zeitbedarf je Schritt, Fehlversuchsmuster. Zweck ist Content-Verbesserung, nicht Personenbewertung.

**Akzeptanzkriterien**

- [ ] Kennzahlen je Schritt abrufbar
- [ ] Pseudonymisierung ist pro Mandant aktivierbar
- [ ] Pipeline funktioniert bei kurzzeitigem Verbindungsverlust ohne Datenverlust

### AITP-111 — Contract-Testsuite für Runtime-Adapter

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M2 · **Anforderungen** FR-30, NFR-05 · **Abhängig von** AITP-20

Gemeinsame Testsuite, die jeder Adapter bestehen muss - Mount, Events, Query, resolveTarget, describeSurface, Snapshot/Restore.

**Akzeptanzkriterien**

- [ ] Suite läuft gegen alle vorhandenen Adapter
- [ ] Ein neuer Adapter ist mit der Suite in unter einem Tag verifizierbar

### AITP-113 — Pilot mit echten Erstnutzern

**Typ** task · **Priorität** Must · **Schätzung** 8 SP · **Meilenstein** M3 · **Abhängig von** AITP-92, AITP-110

Mindestens 15 Personen ohne Vorkenntnisse durchlaufen das VS-Code-Modul. Erhoben werden Abschlussquote, Hinweisbedarf, Abbruchpunkte, Verständnisfragen im Nachgespräch und die offenen POC-Fragen (Tutor-Sichtbarkeit, Highlight-Empfinden, Führungsgrad).

**Akzeptanzkriterien**

- [ ] Mindestens 15 Durchläufe ausgewertet
- [ ] Alle acht offenen Fragen aus der POC-Spezifikation sind beantwortet
- [ ] Konkrete Content- und UX-Änderungen sind daraus abgeleitet und als Tickets angelegt

### AITP-112 — E2E-Tests je Trainingsmodus

**Typ** story · **Priorität** Should · **Schätzung** 5 SP · **Meilenstein** M3 · **Anforderungen** NFR-05 · **Abhängig von** AITP-92

Playwright-Durchläufe für je ein Explore-, Guided- und Challenge-Szenario.

**Akzeptanzkriterien**

- [ ] Drei Durchläufe laufen in CI
- [ ] Overlay-Positionierung wird visuell geprüft
- [ ] Testdauer bleibt unter zehn Minuten

### AITP-114 — Simulator-Aktualitätsprüfung als wiederkehrender Prozess

**Typ** chore · **Priorität** Should · **Schätzung** 3 SP · **Meilenstein** M4 · **Anforderungen** NFR-14

Halbjährlicher Abgleich der Simulatoren mit der realen Produktoberfläche. Größtes Langzeitrisiko des Simulationsansatzes - ohne festen Prozess veraltet der Inhalt still.

**Akzeptanzkriterien**

- [ ] Checkliste je Produkt vorhanden
- [ ] Verantwortlichkeit und Turnus dokumentiert
- [ ] Abweichungen erzeugen automatisch Tickets und markieren betroffene Szenarien

---

## EP-13 — Datenklassifizierung & Dokumenten-Check

*Ziel: Mitarbeitende lernen, was in KI-Werkzeuge darf - und können es am echten Dokument in der eigenen Firmen-Boundary prüfen*

### AITP-120 — Klassifizierungsschema als mandantenkonfigurierbares Datenmodell

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M2 · **Anforderungen** FR-70 · **Abhängig von** AITP-1

ClassificationScheme mit Stufen in Rangfolge, Indikatoren mit Mindeststufe, KI-Freigabematrix und Unsicherheitsregel gemäß docs/10 §10.3. Standardschema öffentlich/intern/vertraulich/streng vertraulich als Ausgangspunkt; ein vorhandenes Firmenschema (z. B. aus ISO-27001-Richtlinie) muss übernehmbar sein.

**Akzeptanzkriterien**

- [ ] Schema ist als YAML mit JSON-Schema-Validierung ablegbar
- [ ] Mehrere ausgelöste Indikatoren ergeben die höchste Mindeststufe
- [ ] Freigabematrix ordnet jedem KI-Werkzeug eine maximale Stufe zu
- [ ] Lernmodul und Dokumenten-Check lesen dasselbe Schema

### AITP-121 — Classification-Simulator als Runtime-Adapter

**Typ** story · **Priorität** Must · **Schätzung** 8 SP · **Meilenstein** M2 · **Anforderungen** FR-71, NFR-07 · **Abhängig von** AITP-20, AITP-111

Einfacher Adapter mit Dokumentvorschau und Zuordnungsinteraktion (Dokument ansehen, Merkmale markieren, Stufe wählen, KI-Entscheidung treffen). Implementiert das RuntimeAdapter-Interface und besteht die Contract-Tests - dritter Generizitätsbeweis.

**Akzeptanzkriterien**

- [ ] Adapter besteht die Contract-Testsuite ohne Sonderbehandlung
- [ ] Synthetische Dokumente werden aus Content-Dateien geladen, nicht hart codiert
- [ ] Emittiert Events wie document.viewed, indicator.marked, level.selected
- [ ] Keine Änderung an packages/training-engine nötig (per Diff belegt)

### AITP-122 — Lernmodul "Datenklassifizierung & KI-Nutzung" in allen drei Modi

**Typ** story · **Priorität** Must · **Schätzung** 13 SP · **Meilenstein** M3 · **Anforderungen** FR-71, FR-72 · **Abhängig von** AITP-120, AITP-121, AITP-11

Explore (Stufen und Merkmale erkunden), Guided (fünf synthetische Beispieldokumente mit Begründung einordnen), Challenge (zehn Dokumente selbstständig klassifizieren und je Dokument die KI-Entscheidung treffen). Neuer Validatortyp classification mit near-miss-Begründung des übersehenen Merkmals. Ausschließlich synthetische Dokumente.

**Akzeptanzkriterien**

- [ ] Alle drei Szenarien laufen fehlerfrei durch
- [ ] near-miss nennt konkret das übersehene oder falsch bewertete Merkmal
- [ ] Die Regel "im Zweifel höher einstufen" ist Lerninhalt und wird in der Challenge belohnt
- [ ] Challenge-Bestehen erzeugt einen Kompetenznachweis mit Lernzielen
- [ ] Kein einziges echtes Dokument ist Bestandteil des Moduls

### AITP-123 — Synthetischer Dokumentenkorpus mit Grenzfällen

**Typ** story · **Priorität** Must · **Schätzung** 5 SP · **Meilenstein** M2 · **Anforderungen** FR-71 · **Abhängig von** AITP-120

Mindestens 20 synthetische Dokumente (Angebot, Gehaltsliste, Pressemitteilung, Kundenvertrag, Meeting-Notiz, Organigramm, Quellcode-Auszug, Support-Ticket u. a.) mit dokumentierter Soll-Klassifizierung und den auslösenden Merkmalen. Bewusst inklusive Grenzfällen (z. B. interne Notiz mit einem einzelnen Personennamen). Dient zugleich als Testkorpus für die Klassifizierungs-Engine.

**Akzeptanzkriterien**

- [ ] Jedes Dokument hat Soll-Stufe, Soll-KI-Entscheidung und Merkmalsliste
- [ ] Mindestens fünf dokumentierte Grenzfälle
- [ ] Alle Namen, Firmen und Zahlen sind erfunden und als solche gekennzeichnet

### AITP-124 — Klassifizierungs-Engine Stufe 1+2 - Kennzeichnungs- und Mustererkennung

**Typ** story · **Priorität** Should · **Schätzung** 8 SP · **Meilenstein** M4 · **Anforderungen** FR-76, FR-77 · **Abhängig von** AITP-120, AITP-123

Deterministische Analyse ohne LLM - vorhandene Vertraulichkeitsvermerke und Dokumenteigenschaften erkennen (Stufe 1), Muster für Personenbezug, Kunden- und Vertragsdaten, Gehalts-/HR-Daten, Finanzkennzahlen sowie mandantenspezifische Schlüsselwortlisten (Stufe 2). Asymmetrisch konservativ - bei Unsicherheit höhere Stufe plus Hinweis auf menschliche Prüfung.

**Akzeptanzkriterien**

- [ ] Engine läuft vollständig ohne Netzwerkzugriff auf externe Modelle
- [ ] Gegen den Testkorpus aus AITP-123 keine False Negatives bei streng vertraulich
- [ ] Unsicherheitsfälle werden als solche gekennzeichnet, nicht still entschieden
- [ ] Unterstützte Formate mindestens PDF, DOCX, XLSX, TXT

### AITP-125 — Dokumenten-Check-Dienst in dedizierter Mandanten-Boundary

**Typ** story · **Priorität** Should · **Schätzung** 13 SP · **Meilenstein** M4 · **Anforderungen** FR-73, FR-74, FR-75 · **Abhängig von** AITP-124, AITP-84

Upload, Analyse im Speicher, Ergebnisansicht mit Stufe, erkannten Merkmalen, Freigabematrix und Empfehlungs-Disclaimer. Deployment je Firma in eigener Umgebung (eigenes Konto/eigene DB), niemals in der geteilten Plattform-Datenbank. Dokumentinhalte werden nicht persistiert und erscheinen in keinem Log.

**Akzeptanzkriterien**

- [ ] Ergebnis zeigt immer Stufe, Begründung, Freigabematrix und Disclaimer
- [ ] Nach der Analyse ist der Inhalt nachweislich nicht mehr gespeichert
- [ ] Persistiert werden nur Zeitstempel, Dateityp, Stufe, Merkmals-IDs, Nutzer-ID
- [ ] Jedes Ergebnis verlinkt auf die passende Lerneinheit des Klassifizierungsmoduls
- [ ] Deployment-Anleitung für eine dedizierte Mandanteninstanz liegt vor

### AITP-127 — Rechtliche Positionierung und Datenflussprüfung des Dokumenten-Checks

**Typ** task · **Priorität** Should · **Schätzung** 3 SP · **Meilenstein** M4 · **Anforderungen** FR-78, FR-79 · **Abhängig von** AITP-125

Externe Prüfung - Haftungspositionierung als Empfehlung, DSGVO-Bewertung der Verarbeitung (Auftragsverarbeitung, Rechtsgrundlage, Löschkonzept), technische Datenflussprüfung (kein Inhalt in Logs, Telemetrie, Backups). Ergebnis fließt in Disclaimer-Texte und Vertragsanlagen ein.

**Akzeptanzkriterien**

- [ ] Schriftliche rechtliche Einschätzung liegt vor
- [ ] Datenflussprüfung mit Ergebnisprotokoll durchgeführt
- [ ] Disclaimer- und AVV-Texte sind abgestimmt

### AITP-126 — LLM-Bewertungsstufe innerhalb der Mandanten-Boundary (optional)

**Typ** story · **Priorität** Could · **Schätzung** 8 SP · **Meilenstein** M5 · **Anforderungen** FR-76 · **Abhängig von** AITP-125

Kontextverständnis für Grenzfälle über ein Modell, das in der Boundary des Mandanten läuft (z. B. Bedrock im Firmenkonto). Externes API nur mit ausdrücklichem, dokumentiertem Opt-in des Mandanten. Die LLM-Stufe darf eine regelbasierte Einstufung nur erhöhen oder bestätigen, nie senken.

**Akzeptanzkriterien**

- [ ] Ohne konfiguriertes Boundary-Modell bleibt der Check voll funktionsfähig
- [ ] LLM-Ergebnis kann eine Stufe nie herabsetzen
- [ ] Datenfluss ist dokumentiert und je Mandant abschaltbar

### AITP-128 — Aggregiertes Reporting des Dokumenten-Checks für Informationssicherheit

**Typ** story · **Priorität** Could · **Schätzung** 5 SP · **Meilenstein** M5 · **Anforderungen** FR-79 · **Abhängig von** AITP-125, AITP-100

Aggregierte Auswertung (Verteilung der Stufen, häufigste Merkmale, Trend) für die Informationssicherheit - ohne personenbezogene Einzelauswertung, gemäß den Sichtbarkeitsstufen aus docs/05 §5.6.

**Akzeptanzkriterien**

- [ ] Auswertungen erst ab n gleich 5 Prüfvorgängen sichtbar
- [ ] Keine Ansicht verknüpft Person und geprüftes Einzeldokument
- [ ] Export als CSV
