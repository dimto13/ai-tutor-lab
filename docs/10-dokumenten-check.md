# 10 — Dokumenten-Check: Klassifizierung und KI-Freigabe

## 10.1 Problem und Produktidee

Die häufigste und riskanteste Unsicherheit im KI-Alltag von Mitarbeitenden ist nicht die
Bedienung des Werkzeugs, sondern die Frage davor:

> "Darf ich **dieses Dokument** überhaupt in Copilot / ChatGPT / Claude hochladen?"

Heute wird diese Frage entweder gar nicht gestellt (Risiko für die Firma) oder aus Angst
pauschal mit Nein beantwortet (Produktivitätsverlust). Beides ist schlecht. Die Plattform
schließt diese Lücke mit **zwei klar getrennten Bausteinen**:

| Baustein                                              | Was                                                                                                                  | Daten                                           | Wo                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| **A — Lernmodul "Datenklassifizierung & KI-Nutzung"** | Verstehen, was öffentlich / intern / vertraulich / streng vertraulich bedeutet und was daraus für KI-Werkzeuge folgt | ausschließlich **synthetische Übungsdokumente** | normale Trainingsplattform                        |
| **B — Dokumenten-Check (Prüfwerkzeug)**               | Echtes Dokument hochladen → Klassifizierungsvorschlag mit Begründung → Freigabematrix je KI-Werkzeug                 | echte Firmendokumente                           | **dedizierte, mandantenverwaltete Infrastruktur** |

Die Trennung ist das zentrale Sicherheitsprinzip: **Geübt wird an synthetischen Dokumenten,
geprüft wird nur in der eigenen Firmen-Boundary.** Ein Trainingssystem, das echte vertrauliche
Dokumente in eine gemeinsam genutzte Lernplattform zieht, würde genau das Problem erzeugen,
das es lösen soll.

## 10.2 Baustein A — Lernmodul (Concept-Layer)

Fügt sich vollständig in die bestehende Architektur ein: ein Modul der Lernachse `concept`,
lauffähig auf einem neuen `classification-simulator`-Adapter (im Kern eine Dokumentvorschau
mit Zuordnungsinteraktion). Keine Engine-Änderung nötig — das ist zugleich ein weiterer
Generizitätsbeweis.

**Inhalte (Explore / Guided / Challenge):**

- **Explore:** Die vier Stufen des Standardschemas mit anschaulichen Beispielen erkunden.
  Was macht ein Dokument vertraulich? Personenbezug, Kundendaten, Finanzkennzahlen,
  Geschäftsgeheimnisse, Kennzeichnungen ("NUR FÜR DEN INTERNEN GEBRAUCH").
- **Guided:** Synthetische Beispieldokumente (Angebot, Gehaltsliste, Pressemitteilung,
  Kundenvertrag, Meeting-Notiz mit Personenbezug) Schritt für Schritt einordnen — mit
  Begründung, warum welche Merkmale welche Stufe auslösen.
- **Challenge:** Zehn synthetische Dokumente selbstständig klassifizieren **und** je Dokument
  entscheiden: Darf das in das firmenzugelassene KI-Werkzeug? Bewertet wird die
  Übereinstimmung mit der hinterlegten Richtlinie, inklusive der Regel "im Zweifel höher
  einstufen".

**Validierung:** neuer deklarativer Validatortyp `classification` (Zuordnung Dokument → Stufe
→ KI-Entscheidung). Falsche Zuordnung ist ein `near-miss` mit Begründung, welches Merkmal
übersehen wurde.

**Wichtigster didaktischer Punkt:** Nicht die Stufe auswendig lernen, sondern die
**Merkmale erkennen**, die eine Stufe auslösen. Das Abschluss-Feedback zeigt deshalb je
Dokument die übersehenen bzw. korrekt erkannten Merkmale.

## 10.3 Baustein B — Dokumenten-Check (Prüfwerkzeug)

### Ablauf aus Nutzersicht

```
Dokument auswählen (Drag & Drop)
        │
        ▼
Analyse in der Mandanten-Boundary
        │
        ▼
┌─────────────────────────────────────────────────────┐
│  Vorschlag: VERTRAULICH                             │
│                                                     │
│  Erkannte Merkmale:                                 │
│  · Personenbezogene Daten (3 Namen, 1 Gehaltsangabe)│
│  · Kundenname in Kombination mit Vertragswert       │
│  · Kennzeichnung "intern" in der Fußzeile           │
│                                                     │
│  Freigabematrix (gemäß Richtlinie deiner Firma):    │
│  M365 Copilot (Firmen-Tenant)      ✔ erlaubt        │
│  Öffentliche KI-Chats             ✖ nicht erlaubt   │
│  GitHub Copilot                   – nicht relevant  │
│                                                     │
│  Dies ist eine Empfehlung. Die verbindliche         │
│  Entscheidung trifft deine Führungskraft bzw. die   │
│  Richtlinie deiner Firma. Im Zweifel: höher         │
│  einstufen und nachfragen.                          │
└─────────────────────────────────────────────────────┘
```

Das Ergebnis ist immer **Stufe + Begründung + Freigabematrix + Empfehlungs-Disclaimer**.
Eine Stufe ohne Begründung erzeugt keinen Lerneffekt und kein Vertrauen; eine Begründung ohne
Freigabematrix beantwortet die eigentliche Frage nicht.

### Mandantenspezifisches Klassifizierungsschema

Jede Firma hat ein eigenes Schema. Das Standardschema (öffentlich / intern / vertraulich /
streng vertraulich) ist nur der Startpunkt. Konfigurierbar pro Mandant:

```yaml
classificationScheme:
  tenantId: firma-x
  levels:
    - id: public # Reihenfolge = Rangfolge
      label: Öffentlich
    - id: internal
      label: Intern
    - id: confidential
      label: Vertraulich
    - id: strictly_confidential
      label: Streng vertraulich
  indicators: # Merkmale → Mindeststufe
    - id: personal_data
      label: Personenbezogene Daten
      minLevel: confidential
    - id: customer_contract_data
      label: Kundendaten mit Vertragsbezug
      minLevel: confidential
    - id: salary_data
      label: Gehalts-/HR-Daten
      minLevel: strictly_confidential
    - id: marking_internal
      label: Kennzeichnung "intern"
      minLevel: internal
  aiPolicy: # Freigabematrix
    - tool: m365-copilot-tenant
      maxLevel: confidential # bis einschließlich dieser Stufe erlaubt
    - tool: public-ai-chat
      maxLevel: public
    - tool: github-copilot
      maxLevel: internal
  defaultOnUncertainty: escalate # im Zweifel: höhere Stufe + Hinweis
```

### Klassifizierungs-Engine — dreistufig, konservativ

| Stufe | Verfahren                                                                                                                                                | Datenfluss                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1     | **Kennzeichnungserkennung** — vorhandene Labels, Fußzeilen, Vertraulichkeitsvermerke, Dokumenteigenschaften                                              | lokal in der Mandanten-Boundary                                                                                           |
| 2     | **Musterbasierte Analyse** — Personenbezug (Namen, Ausweis-/Personalnummern, Gehälter), Kundenbezug, Finanzkennzahlen, Schlüsselwortlisten des Mandanten | lokal in der Mandanten-Boundary                                                                                           |
| 3     | **LLM-gestützte Bewertung** (optional) — Kontextverständnis für Grenzfälle                                                                               | **nur** mit Modell innerhalb der Mandanten-Boundary (z. B. Bedrock im eigenen Konto) oder ausdrücklichem Mandanten-Opt-in |

Regeln:

- Die Stufen 1 und 2 arbeiten deterministisch und sind allein lauffähig — der Check
  funktioniert also auch **ganz ohne LLM**.
- Mehrere ausgelöste Merkmale → die **höchste** Mindeststufe gewinnt.
- Unsicherheit → `defaultOnUncertainty` greift (Standard: höher einstufen und zur
  menschlichen Prüfung raten). **Ein falsches "unbedenklich" ist der teuerste Fehler des
  Systems**; ein falsches "vertraulich" kostet nur eine Nachfrage. Die Engine ist deshalb
  bewusst asymmetrisch konservativ kalibriert.

### Datenhaltung — das kritischste Designelement

Der Check verarbeitet genau die Dokumente, die nirgendwo hochgeladen werden sollen. Daraus
folgen harte Regeln:

1. **Dedizierte, mandantenverwaltete Instanz.** Der Dokumenten-Check läuft je Firma in einer
   eigenen Umgebung (eigene Datenbank, eigener Speicher, eigenes Konto oder On-Premises) —
   niemals in einer gemeinsam genutzten Lernplattform-Datenbank.
2. **Inhalte werden standardmäßig nicht gespeichert.** Analyse im Speicher, danach verworfen.
   Persistiert werden nur: Zeitstempel, Dateityp, Ergebnisstufe, ausgelöste Merkmals-IDs
   (ohne Fundstellen-Text), Nutzer-ID. Aufbewahrung konfigurierbar, Standard 90 Tage.
3. **Kein Trainings-/Telemetrie-Abfluss.** Dokumenteninhalte erscheinen nie in Events,
   Logs oder Lernanalytik der Plattform.
4. **Audit-Log für die Firma**, nicht für Leistungskontrolle: aggregierte Auswertung
   ("wie oft wurde streng vertraulich erkannt") ja — personenbezogene Auswertung
   ("wer wollte was hochladen") nur gemäß den Sichtbarkeitsstufen aus `docs/05` §5.6.
5. **Verschlüsselung** in Übertragung und, falls Zwischenspeicherung nötig, im Ruhezustand.

### Positionierung des Ergebnisses

Der Check gibt eine **Empfehlung**, keine verbindliche Rechtseinschätzung. Das ist keine
Vorsicht aus Feigheit, sondern Produktschutz: Ein Werkzeug, das verbindliche
Freigabeentscheidungen behauptet, haftet für jeden False Negative. Die verbindliche Regel
bleibt die Firmenrichtlinie; der Check macht sie am konkreten Dokument erlebbar. Rechtliche
Prüfung dieser Positionierung: `AITP-127`.

## 10.4 Zusammenspiel der Bausteine

```
Lernmodul (synthetisch)            Dokumenten-Check (echt)
        │                                   │
        │  vermittelt Merkmale              │  wendet Merkmale an
        ▼                                   ▼
   Kompetenznachweis  ◄─────────►  Freigabematrix der Firma
   "kann klassifizieren"            (dieselbe Schema-Definition!)
```

Beide Bausteine nutzen **dasselbe mandantenspezifische Schema** (`classificationScheme`).
Das Lernmodul trainiert exakt die Regeln, die der Check anwendet — und der Check verlinkt
bei jedem Ergebnis auf die passende Lerneinheit ("Warum ist das vertraulich? → 3-Minuten-Modul").
Das macht aus einem Kontrollwerkzeug ein Lernwerkzeug und umgekehrt.

## 10.5 Abgrenzung

Der Dokumenten-Check ist **kein** DLP-System (Data Loss Prevention), kein Proxy vor den
KI-Werkzeugen und blockiert nichts. Er ist ein Selbsthilfe- und Lernwerkzeug **vor** dem
Upload. Firmen mit DLP-Anforderungen brauchen zusätzlich technische Kontrollen — das kann
später eine Integrationsschnittstelle werden (Merkmalskatalog exportieren), ist aber kein
MVP-Ziel.
