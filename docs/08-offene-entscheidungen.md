# 08 — Offene Entscheidungen, Risiken und Fragen an dich

## Teil A — Architekturentscheidungen (ADR)

Jede ADR bekommt später eine eigene Datei mit Status (vorgeschlagen / entschieden / abgelöst).

| ID         | Frage                                                                                                                       | Empfehlung                                                                            | Konsequenz bei Fehlentscheidung                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **ADR-01** | Simulation oder echte Runtime?                                                                                              | **Hybrid:** Explore/Guided simuliert, Challenge/Zertifizierung später real            | Rein simuliert → Transferproblem; rein real → Kosten und Startzeiten                   |
| **ADR-02** | Content als TypeScript oder YAML/JSON?                                                                                      | **YAML mit JSON-Schema.** Nur so können Nicht-Entwickler und LLMs Kurse erzeugen      | TS-Content bindet jede Kursänderung an einen Entwickler-Release                        |
| **ADR-03** | Amplify Data (DynamoDB) oder Postgres?                                                                                      | Fortschritt/Punkte in Amplify Data; **Katalog und Content im Git**, nicht in der DB   | Relationalen Katalog in DynamoDB abzubilden erzeugt dauerhaften Reibungsverlust        |
| **ADR-04** | Tutor-LLM: welcher Anbieter, wo gehostet?                                                                                   | Serverseitiger Proxy, austauschbarer Anbieter, Stufe 1 immer ohne LLM lauffähig       | Direkte Client-Anbindung = Schlüsselabfluss + Datenschutzproblem                       |
| **ADR-05** | Overlay im iFrame realer Runtimes                                                                                           | Muss vor M6 mit `AITP-27` geklärt werden                                              | Ein Overlay, das über code-server nicht funktioniert, kippt das Führungskonzept        |
| **ADR-06** | Eigene Plattform oder bestehende Lösung (Instruqt, Killercoda o. ä.)?                                                       | **Vor M2 bewusst prüfen**                                                             | Ein halbes Jahr Eigenbau für etwas Kaufbares                                           |
| **ADR-07** | Telemetrie-Tiefe vs. Datenschutz                                                                                            | Roh-Events 90 Tage, danach Aggregate; Pseudonymisierung schaltbar                     | Zu viel → Betriebsrat blockiert; zu wenig → Didaktik nicht verbesserbar                |
| **ADR-08** | Anbindung an ein vorhandenes LMS (SCORM/xAPI)?                                                                              | Nur prüfen, wenn im Zielunternehmen ein LMS existiert                                 | Doppelte Nachweisführung, Akzeptanzproblem bei L&D                                     |
| **ADR-09** | Interne Plattform oder Produkt für Fremdkunden?                                                                             | **Muss beantwortet werden, bevor M2 startet**                                         | Bestimmt, ob Multi-Tenancy, Branding und Abrechnung Must oder Won't sind               |
| **ADR-10** | Klassifizierungs-Engine: rein regelbasiert, LLM in der Mandanten-Boundary (z. B. Bedrock im Firmenkonto) oder externes API? | **Stufenmodell:** Regeln immer, LLM nur in der Boundary; externes API nie ohne Opt-in | Ein Check, der Dokumente an fremde APIs schickt, zerstört sein eigenes Wertversprechen |
| **ADR-11** | Dokumenten-Check-Deployment: eigenes AWS-Konto je Firma, eigene VPC/DB im Plattformkonto oder On-Premises-Paket?            | Eigenes Konto je Firma als Standard; On-Premises als Option für regulierte Branchen   | Geteilte Infrastruktur ist für dieses Feature ein Ausschlusskriterium im Vertrieb      |

## Teil B — Risiken

| ID  | Risiko                                                                                                                                                                  | Eintritt | Wirkung   | Gegenmaßnahme                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Simulator-Drift** — VS Code und Copilot ändern ihre Oberfläche mehrmals jährlich; die Simulation veraltet still                                                       | hoch     | hoch      | `AITP-114` Prüfzyklus, Versionsbindung der Szenarien, Nachweise mit Ablaufdatum                                                                                                                                |
| R2  | **Transferproblem** — Nutzer bestehen die Simulation, scheitern am echten Werkzeug                                                                                      | mittel   | hoch      | Challenge-Modus, später echte Runtime für Zertifizierung, Transfer im Pilot messen                                                                                                                             |
| R3  | **Scope Creep durch Multi-Provider** — fünf Anbieter halb umgesetzt statt einer vollständig                                                                             | hoch     | mittel    | Genau ein zweiter Adapter als Generizitätsbeweis (`AITP-25`), mehr nicht vor M4                                                                                                                                |
| R4  | **Mitbestimmung/Datenschutz** blockiert die Einführung wegen Punktesystem und Telemetrie                                                                                | mittel   | hoch      | Sichtbarkeitsstufen, Transparenzseite, Muster-Betriebsvereinbarung (`AITP-100/101/104`)                                                                                                                        |
| R5  | **Runtime-Kosten** echter Umgebungen sprengen den Business Case                                                                                                         | mittel   | hoch      | Hybrid-Strategie, Spike `AITP-27` mit belastbarer Kostenrechnung vor M6                                                                                                                                        |
| R6  | **Tutor halluziniert** nicht existierende UI-Schritte und verwirrt genau die unsichere Zielgruppe                                                                       | mittel   | hoch      | Stufe 1 deterministisch als Standard, Guardrails in Stufe 2                                                                                                                                                    |
| R7  | **Prototyp-Codebasis** aus dem Prototyping-Werkzeug trägt die Plattform nicht                                                                                           | mittel   | mittel    | M1 vor jedem Feature-Ausbau; klare Abhängigkeitsrichtung per Lint erzwungen                                                                                                                                    |
| R9  | **Falsche Sicherheit durch den Dokumenten-Check** — ein False Negative ("unbedenklich", obwohl streng vertraulich) verleitet zum Upload und schadet mehr als kein Check | mittel   | sehr hoch | Konservative Asymmetrie (`FR-77`), Empfehlungs-Disclaimer (`FR-78`), Kennzeichnungs- und Mustererkennung vor jeder LLM-Bewertung, rechtliche Positionierung (`AITP-127`), Testkorpus mit bekannten Grenzfällen |
| R10 | **Der Check wird selbst zum Datenrisiko** — Inhalte landen in Logs, Telemetrie oder geteilter DB                                                                        | mittel   | sehr hoch | Keine Inhaltspersistenz (`FR-75`), dedizierte Mandanten-Boundary (`FR-74`), Penetrations-/Datenflussprüfung vor Freigabe                                                                                       |
| R8  | **Content-Aufwand unterschätzt** — ein gutes Modul kostet mehr Zeit als der Simulator                                                                                   | hoch     | mittel    | Autorenwerkzeug (`AITP-94`), Wiederverwendung über Lernziele, ein Modul vollständig statt fünf halb                                                                                                            |

R1 und R8 sind erfahrungsgemäß die unterschätzten. Die Technik ist in diesem Projekt nicht
der schwierige Teil — der Inhalt und seine Pflege sind es.

## Teil C — Fragen, die ich dir nicht beantworten kann

Diese Punkte bestimmen die Priorisierung stärker als jede Architekturentscheidung:

1. **Intern oder Produkt?** Baust du das für dein eigenes Unternehmen oder als Angebot für
   andere Firmen? → entscheidet ADR-09, Multi-Tenancy, Branding, Abrechnung.
2. **Wer schreibt die Inhalte?** Du allein, ein Team, oder Fachbereiche selbst?
   → entscheidet, wie stark in Autorenwerkzeuge investiert werden muss (`AITP-94`).
3. **Wie viele Personen sollen realistisch geschult werden?** 30, 300 oder 3000?
   → entscheidet Runtime-Strategie und Betriebsmodell.
4. **Gibt es bereits ein LMS im Unternehmen?** → ADR-08.
5. **Existiert ein Betriebsrat, und wie früh soll er eingebunden werden?**
   → Erfahrungsgemäß früh einbinden ist deutlich billiger als nachträglich verhandeln.
6. **Welches Budget und welche Teamgröße?** Der Backlog umfasst 423 Story Points. Als
   grobe Orientierung: für eine Person mit KI-Unterstützung sind M1+M2 eher ein
   Quartal als ein Monat.
7. **Was ist der erste konkrete Anwendungsfall mit echten Nutzern?** Ohne benannte Pilotgruppe
   fehlt M3 die Grundlage.
8. **Gibt es in der Zielfirma bereits ein offizielles Klassifizierungsschema** (z. B. aus der
   Informationssicherheitsrichtlinie / ISO 27001)? Wenn ja, wird es übernommen, nicht neu
   erfunden — das Schema im Produkt muss dem Firmenschema entsprechen, sonst lernt der
   Nutzer die falschen Regeln.
9. **Wer pflegt die KI-Freigabematrix** (welches Werkzeug bis welche Stufe)? Ohne benannten
   Owner (typisch: Informationssicherheit) veraltet die Matrix und der Check gibt falsche
   Auskünfte.

## Teil D — Bewertung des ursprünglichen Plans

Was am ursprünglichen Konzept stark ist:

- Die Grundidee — Handeln im Werkzeug statt Folien — ist richtig und differenzierend.
- Die Entscheidung, im POC zu simulieren statt zu deployen, war goldrichtig.
- Die Kritik am ersten POC (fehlende Trennung von Inhalt und Werkzeug) trifft den Kern.

Was im ursprünglichen Konzept fehlt oder zu früh kommt:

- **Zu früh:** Kubernetes, PVCs, Idle-Reclaimer, Autoscaling, RAG in Phase 1–2. Das sind
  Lösungen für Probleme, die vor 500 Nutzern nicht existieren.
- **Fehlt vollständig:** Content-Erstellung und -Pflege. Der Plan beschreibt eine Plattform,
  aber niemanden, der sie füllt. Das ist der eigentliche Engpass.
- **Fehlt:** Datenschutz, Mitbestimmung, Barrierefreiheit, Mehrsprachigkeit — alles
  Einführungsblocker im deutschen Unternehmenskontext, nicht Kür.
- **Fehlt:** Messung der didaktischen Wirksamkeit. Der Plan misst Startzeiten und Isolation,
  aber nicht, ob jemand etwas gelernt hat.
- **Fehlt:** Nachweisfähigkeit als Produktwert (EU AI Act Art. 4) — der stärkste kommerzielle
  Hebel taucht im Ursprungsplan gar nicht auf.

Alle diese Punkte sind in diesem Paket als Anforderungen und Tickets ergänzt.
