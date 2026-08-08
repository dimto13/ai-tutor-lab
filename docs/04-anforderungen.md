# 04 — Anforderungskatalog

Priorität nach MoSCoW: **M** = Must (MVP), **S** = Should, **C** = Could, **W** = Won't (jetzt).

## Funktionale Anforderungen

### Katalog und Content

| ID | Anforderung | Prio |
|---|---|---|
| FR-01 | Das System bildet Technology → Provider → Product → ProductVersion → Capability als Katalog ab. | M |
| FR-02 | Ein Produkt kann als Integration in einem Host-Produkt hinterlegt werden (Copilot in VS Code). | M |
| FR-03 | Szenarien liegen als deklarative Daten außerhalb von UI-Komponenten vor. | M |
| FR-04 | Szenarien werden gegen ein JSON-Schema validiert; Verstöße brechen den Build. | M |
| FR-05 | Ein Modul ist genau einer Lernachse (`tool`/`concept`/`ai_workflow`) zugeordnet. | M |
| FR-06 | Lernziele sind modulübergreifend referenzierbar und in Nachweisen auswertbar. | S |
| FR-07 | Content ist mehrsprachig ablegbar (DE/EN), mit Fallback auf DE. | S |
| FR-08 | Ein Autorenmodus erlaubt Vorschau und Schrittvalidierung ohne Deployment. | C |

### Trainingsengine

| ID | Anforderung | Prio |
|---|---|---|
| FR-10 | Zustände je Schritt: NOT_STARTED, ACTIVE, VALIDATION_FAILED, COMPLETED, SKIPPED. Genau ein Schritt ist ACTIVE. | M |
| FR-11 | Die Engine reagiert auf Events der Laufzeit; Fortschritt wird nicht primär über einen "Weiter"-Button ausgelöst. | M |
| FR-12 | Validatoren sind deklarativ (`event`, `state`, `sequence`, `all`, `any`). | M |
| FR-13 | Validierung liefert `pass` / `near-miss` / `ignore`; nur `near-miss` erzeugt Nutzer-Feedback. | M |
| FR-14 | Im Challenge-Modus wird der Endzustand geprüft, nicht die Handlungsreihenfolge. | M |
| FR-15 | Fortschritt wird persistiert und bei Wiederkehr exakt wiederhergestellt (Schritt, Runtime-Snapshot, Hinweise, Fehlversuche). | M |
| FR-16 | Schritte können als optional markiert und übersprungen werden. | S |
| FR-17 | Ein Szenario kann jederzeit zurückgesetzt werden. | S |
| FR-18 | Die Engine ist ohne Browser lauffähig und testbar. | M |

### Trainingsmodi

| ID | Anforderung | Prio |
|---|---|---|
| FR-20 | Explore-Modus: Nutzer inspiziert UI-Elemente frei, System erklärt jedes Element per `describeSurface()`. | M |
| FR-21 | Guided-Modus: Schritt-für-Schritt mit Overlay und drei Hilfestufen. | M |
| FR-22 | Challenge-Modus: nur Zielbeschreibung, Tutor nur auf Anfrage, Hinweise kosten Punkte. | M |
| FR-23 | Ein Modul kann alle drei Modi anbieten; der empfohlene Einstieg ist konfigurierbar. | S |
| FR-24 | Erfahrene Nutzer können den Guided-Modus überspringen und direkt Challenge starten. | S |

### Laufzeitumgebungen

| ID | Anforderung | Prio |
|---|---|---|
| FR-30 | Alle Laufzeiten implementieren das einheitliche `RuntimeAdapter`-Interface. | M |
| FR-31 | Der VS-Code-Simulator bildet die Informationsarchitektur korrekt ab: Menüleiste, Activity Bar, Side Bar, Editor mit Tabs, Panel (Terminal/Problems/Output), Statusleiste. | M |
| FR-32 | Der Simulator vermittelt den Unterschied Ordner öffnen ≠ Workspace öffnen. | M |
| FR-33 | Terminal-Simulator erkennt definierte Kommandos und liefert deterministische Ausgaben inkl. Fehlerfällen. | M |
| FR-34 | Ein zweites Produkt (z. B. Claude Code oder M365 Copilot) ist als eigener Adapter lauffähig — als Beweis der Generizität. | M |
| FR-35 | Adapter liefern semantische UI-Ziele (`describeSurface`, `resolveTarget`). | M |
| FR-36 | Adapter unterstützen Snapshot/Restore. | S |
| FR-37 | Echte Runtime (code-server) hinter demselben Interface. | W |

### Führung, Hilfe, Tutor

| ID | Anforderung | Prio |
|---|---|---|
| FR-40 | Overlay dunkelt den Kontext ab, markiert das Ziel, zeigt Tooltip und lässt das Ziel klickbar. | M |
| FR-41 | Kann ein Ziel nicht aufgelöst werden, degradiert das Overlay auf Text statt falsch zu markieren. | M |
| FR-42 | Drei Hilfestufen je Schritt, einzeln abrufbar und protokolliert. | M |
| FR-43 | Guide-Panel zeigt jederzeit: wo bin ich, was tun, warum, war es erfolgreich, was kommt. | M |
| FR-44 | Tutor kennt Szenario, aktuellen Schritt, abgeschlossene Schritte und letzte Aktionen. | M |
| FR-45 | Tutor Stufe 1 antwortet regelbasiert aus dem Content, ohne externes LLM. | M |
| FR-46 | Tutor Stufe 2 (LLM) darf keine UI-Anweisungen erfinden, die nicht im Content hinterlegt sind. | S |
| FR-47 | Tutor-Panel ist ein-/ausklappbar; Sichtbarkeitsverhalten wird im Pilot gemessen. | S |

### Motivation und Nachweis

| ID | Anforderung | Prio |
|---|---|---|
| FR-50 | Punktesystem mit Modus-Multiplikator (Explore 0,5 / Guided 1,0 / Challenge 2,0). | M |
| FR-51 | Hinweisnutzung reduziert nur den Bonus, nie die Basispunkte. | M |
| FR-52 | Punkte aggregieren zu einem Kompetenzprofil je Technology mit Stufen. | M |
| FR-53 | Anti-Gaming: Punkte je Szenario-Version nur einmal; Wiederholungen zählen als Übung ohne Punkte. | M |
| FR-54 | Kompetenznachweise (Attestation) mit Ausstellungsdatum, Lernzielen, Gültigkeit und Exportformat. | M |
| FR-55 | Ranglisten sind standardmäßig deaktiviert, pro Mandant aktivierbar, nur aggregiert oder pseudonymisiert. | M |
| FR-56 | Abschlussbildschirm zeigt Schritte, Dauer, Hinweise, Fehlversuche, Punkte und nächsten Schritt. | M |
| FR-57 | Wöchentliche Lernkontinuität statt Tages-Streaks. | S |

### Datenklassifizierung und Dokumenten-Check

| ID | Anforderung | Prio |
|---|---|---|
| FR-70 | Mandantenspezifisches Klassifizierungsschema (Stufen, Merkmale mit Mindeststufe, KI-Freigabematrix), Standardschema öffentlich/intern/vertraulich/streng vertraulich. | M |
| FR-71 | Lernmodul "Datenklassifizierung & KI-Nutzung" (Concept-Layer) mit ausschließlich synthetischen Übungsdokumenten in allen drei Modi. | M |
| FR-72 | Neuer Validatortyp `classification` (Dokument → Stufe → KI-Entscheidung) mit near-miss-Begründung des übersehenen Merkmals. | M |
| FR-73 | Dokumenten-Check: Upload eines echten Dokuments liefert Klassifizierungsvorschlag mit Begründung (erkannte Merkmale) und Freigabematrix je KI-Werkzeug. | S |
| FR-74 | Der Check läuft in einer dedizierten, mandantenverwalteten Umgebung (eigene DB/Speicher/Konto oder On-Premises); niemals in der geteilten Lernplattform-Datenbank. | S |
| FR-75 | Dokumenteninhalte werden standardmäßig nicht persistiert; gespeichert werden nur Metadaten und Ergebnis. Inhalte erscheinen nie in Events, Logs oder Telemetrie. | S |
| FR-76 | Klassifizierung funktioniert vollständig ohne LLM (Kennzeichnungs- und Mustererkennung); LLM-Stufe nur innerhalb der Mandanten-Boundary oder mit Opt-in. | S |
| FR-77 | Bei Unsicherheit stuft das System höher ein und rät zur menschlichen Prüfung (konservative Asymmetrie). | S |
| FR-78 | Jedes Ergebnis ist als Empfehlung gekennzeichnet; verbindliche Entscheidung bleibt bei Firmenrichtlinie und Mensch. | S |
| FR-79 | Audit-Log des Checks (nur Metadaten) mit konfigurierbarer Aufbewahrung; personenbezogene Auswertung nur gemäß Sichtbarkeitsstufen. | S |

Details: `docs/10-dokumenten-check.md`.

### Plattform, Rollen, Reporting

| ID | Anforderung | Prio |
|---|---|---|
| FR-60 | Dashboard "Meine Trainings" mit Fortschritt, Fortsetzen und Empfehlung des nächsten Moduls. | M |
| FR-61 | Authentifizierung mit Enterprise-SSO (OIDC) und lokalem Fallback. | M |
| FR-62 | Rollen: Lernende:r, Autor:in, Trainer:in/L&D, Mandanten-Admin. | S |
| FR-63 | Reporting: Abschlussquoten, Abbruchpunkte, Hinweisnutzung je Modul — für L&D aggregiert. | S |
| FR-64 | Export von Nachweisen je Person und je Team (PDF/CSV). | S |
| FR-65 | Mandantentrennung auf Datenebene. | S |
| FR-66 | Mandanten-Branding (Logo, Farben). | C |
| FR-67 | Zuweisung von Curricula an Rollen/Gruppen. | C |

## Nicht-funktionale Anforderungen

| ID | Anforderung | Zielwert |
|---|---|---|
| NFR-01 | Startzeit eines Szenarios (Simulator) | < 2 s |
| NFR-02 | Reaktionszeit Schrittvalidierung nach Nutzeraktion | < 300 ms |
| NFR-03 | Startzeit echter Runtime (Stufe B) | < 10 s |
| NFR-04 | Fortschrittsverlust bei Browser-Absturz | ≤ letzter abgeschlossener Schritt |
| NFR-05 | Testabdeckung Training Engine | ≥ 80 % Zeilen |
| NFR-06 | Content-Schema-Verstöße | 0 im Hauptzweig |
| NFR-07 | Ein neues Szenario benötigt keine Änderung an Engine oder Shell | strukturell erzwungen |
| NFR-08 | Barrierefreiheit: Tastaturbedienbarkeit, Kontraste, Screenreader-Labels, keine reine Farbcodierung | WCAG 2.1 AA angestrebt |
| NFR-09 | Datenschutz: Datenminimierung, dokumentierte Aufbewahrungsfristen, Löschkonzept | DSGVO-konform |
| NFR-10 | Telemetrie ist pseudonymisierbar und pro Mandant konfigurierbar | erforderlich |
| NFR-11 | Zielplattform Desktop-Browser (Chrome/Edge/Firefox, aktuelle Versionen), Mindestbreite 1280 px | Desktop-first |
| NFR-12 | Sprache der Oberfläche DE, technisch auf i18n vorbereitet | DE primär |
| NFR-13 | Betrieb ohne lokale Installation und ohne Admin-Rechte auf Firmen-PCs | zwingend |
| NFR-14 | Simulator-Aktualität: dokumentierter Prüfzyklus je Produktversion | halbjährlich |

## Bewusste Nicht-Ziele (jetzt)

Kubernetes, echte Nutzer-Pods, PVCs, echte GitHub-/M365-/Copilot-APIs, RAG auf
Unternehmensrichtlinien, Autoscaling, Lasttests, mobile Nutzung, Offline-Betrieb,
SCORM/xAPI-Anbindung an ein bestehendes LMS (→ als `ADR-08` zu prüfen, falls im Unternehmen
bereits ein LMS im Einsatz ist).
