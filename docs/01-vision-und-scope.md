# 01 — Vision, Zielgruppe und Scope

## 1.1 Produktversprechen

> Mitarbeitende ohne technische Vorkenntnisse lernen in einer geführten Browser-Umgebung,
> ein Werkzeug zu bedienen **und** KI produktiv darin einzusetzen — ohne lokale Installation,
> ohne Admin-Rechte, mit nachweisbarem Kompetenzaufbau.

Der entscheidende Unterschied zu klassischem E-Learning: Es wird nicht _über_ das Werkzeug
gesprochen, sondern _im_ Werkzeug gehandelt, und das System erkennt selbst, ob die Handlung
korrekt war.

## 1.2 Drei Lernachsen

Der POC vermischt diese drei Ebenen noch. Sie müssen fachlich getrennt modelliert werden,
weil sie unterschiedliche Didaktik, unterschiedliche Validierung und unterschiedliche
Wiederverwendbarkeit haben.

| Achse                 | Frage                                | Beispiel                                    | Validierung                        |
| --------------------- | ------------------------------------ | ------------------------------------------- | ---------------------------------- |
| **Tool Knowledge**    | Wie bediene ich das Werkzeug?        | "Wo ist die Activity Bar?"                  | Klick auf UI-Element               |
| **Concept Knowledge** | Was bedeuten die Begriffe?           | "Ordner ≠ Workspace", "Was ist ein Commit?" | Erklärung, Quiz, Zuordnung         |
| **AI Workflow**       | Wie setze ich KI darin sinnvoll ein? | "Copilot Chat mit Kontext versorgen"        | Prompt-Qualität, Ergebnisbewertung |

Ein Kurs komponiert aus diesen Bausteinen einen Lernpfad. Dieselbe Concept-Lektion
"Was ist ein Repository?" wird von Git-, GitHub-Desktop- und Azure-DevOps-Kursen wiederverwendet.

## 1.3 Drei Trainingsmodi

| Modus         | Nutzerhaltung        | Führung                                         | Punkte-Faktor |
| ------------- | -------------------- | ----------------------------------------------- | ------------- |
| **Explore**   | Neugier, orientieren | Nutzer klickt frei, Tutor erklärt jedes Element | ×0,5          |
| **Guided**    | Nachvollziehen       | Schritt-für-Schritt, Overlay, 3 Hilfestufen     | ×1,0          |
| **Challenge** | Können zeigen        | nur Zielbeschreibung, Tutor auf Anfrage         | ×2,0          |

Ohne Explore-Modus besteht die reale Gefahr, dass jemand acht Pfeilen folgt und danach immer
noch nicht weiß, was VS Code ist. Ohne Challenge-Modus lässt sich Kompetenz nicht nachweisen.

## 1.4 Zielgruppen

| Persona                                                             | Bedarf                                                                     | Kritischer Erfolgsfaktor                                 |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Lernende:r** (Sachbearbeitung, Fachbereich, keine IT-Vorkenntnis) | Angstfreier Einstieg, jederzeit wissen "was jetzt?"                        | Überforderungsvermeidung, sofortiges Feedback            |
| **Lernende:r fortgeschritten** (Power-User, Entwickler-nah)         | Schnell zum relevanten Teil, kein Klick-Zwang                              | Überspringen, Challenge-Einstieg                         |
| **Trainer:in / Content-Autor:in**                                   | Szenarien erstellen ohne Frontend-Code                                     | Autorenformat, Vorschau, Versionierung                   |
| **Führungskraft / L&D**                                             | Wer ist geschult? Wo hakt es?                                              | Reporting, aggregierte Auswertung                        |
| **Compliance / Datenschutz / Betriebsrat**                          | Keine verdeckte Leistungskontrolle; klare Regeln, was in KI-Werkzeuge darf | Transparenz, Aggregation, Opt-in, Klassifizierungsschema |
| **Plattform-Betrieb**                                               | Betreibbarkeit, Kosten, Updates                                            | Simulator-Pflege, Runtime-Kosten                         |

## 1.5 Marktkontext (relevant für Priorisierung)

Der EU AI Act verlangt seit Februar 2025 von Anbietern und Betreibern von KI-Systemen,
für ausreichende **KI-Kompetenz** ihres Personals zu sorgen (Art. 4). Das ist der stärkste
kommerzielle Hebel dieses Produkts: Es erzeugt nicht nur Lerneffekt, sondern **prüffähige
Nachweise**. Diese Anforderung ist deshalb nicht "nice to have", sondern gehört ins MVP
(→ `FR-42`, `FR-43`, `docs/05-gamification.md` §5).

Bitte vor der Vermarktung den aktuellen Stand der AI-Act-Umsetzung und der nationalen
Durchführungsgesetze prüfen — die Fristen und Auslegungshilfen entwickeln sich weiter.

## 1.6 Scope-Abgrenzung

### In Scope (bis MVP)

- Generische Trainingsengine mit Modus-, Modul- und Szenariokonzept
- Realistischer VS-Code-Simulator + Terminal-Simulator
- Mindestens zwei Technologien als Beweis der Generizität (VS Code/Copilot **+** ein zweites, z. B. Claude Code oder M365 Copilot)
- Kontextbewusster Tutor (regelbasiert, optional LLM-gestützt)
- Punkte-, Kompetenz- und Nachweissystem
- Lernmodul "Datenklassifizierung & KI-Nutzung" mit synthetischen Übungsdokumenten
- Persistenz, Authentifizierung, Reporting-Grundlage
- Hosting auf AWS Amplify

### Out of Scope (bis MVP, bewusst verschoben)

- Kubernetes, echte Nutzer-Pods, PVCs, code-server
- Echte GitHub-/Microsoft-365-/Copilot-Anbindung
- Multi-Tenant-Mandantentrennung auf Infrastrukturebene
- RAG auf Unternehmensrichtlinien
- Autoscaling, Lasttests
- Mobile-Optimierung (Desktop-first, siehe `NFR-11`)
- Dokumenten-Check mit echten Firmendokumenten (folgt nach dem MVP als dedizierter, mandantenverwalteter Baustein — die geteilte Pilotumgebung darf keine echten vertraulichen Dokumente verarbeiten, siehe `docs/10`)

### Explizit noch nicht entschieden

Siehe `docs/08-offene-entscheidungen.md`. Die wichtigste offene Frage: **interne Plattform
für das eigene Unternehmen oder Produkt für Drittkunden?** Davon hängt ab, ob Multi-Tenancy,
Abrechnung und Mandanten-Branding früh oder spät gebraucht werden.

## 1.7 Erfolgskriterien des MVP

| #   | Kriterium                                                                         | Messung                                                       |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| E1  | Ein unerfahrener Nutzer schließt das VS-Code-Grundlagenmodul ohne fremde Hilfe ab | ≥ 80 % Completion-Rate im Pilot (n ≥ 15)                      |
| E2  | Der Lerneffekt ist messbar, nicht nur die Klickstrecke                            | Challenge-Modus ohne Hinweise bestanden von ≥ 60 %            |
| E3  | Ein zweites Produkt lässt sich ohne Änderung der Engine ergänzen                  | Neue Technologie nur über Content + Adapter, kein Engine-Diff |
| E4  | Ein Szenario ist von einer Nicht-Entwicklerin erstellbar                          | Autor:in erstellt Szenario in ≤ 2 h ohne Code-Review-Blocker  |
| E5  | Schulungsnachweis ist exportierbar und prüffähig                                  | PDF/CSV-Export je Person und Team                             |
