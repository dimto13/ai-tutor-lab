# 05 — Punktesystem, Kompetenzprofil und Nachweise

## 5.1 Zielkonflikt und Leitentscheidung

Die POC-Spezifikation fordert ausdrücklich: *keine verspielte Gamification, kein
Kinder-Lernplattform-Stil*. Gleichzeitig soll ein Punktesystem motivieren. Das ist kein
Widerspruch, wenn Punkte nicht als Spielmechanik, sondern als **Kompetenzwährung** gestaltet
werden.

> **Leitentscheidung:** Punkte drücken nachgewiesene Fähigkeit aus, nicht Aktivität.
> Visuelle Sprache: Fortschrittsringe, Kompetenzmatrix, Nachweise — kein Konfetti,
> keine Maskottchen, keine Tageszähler.

## 5.2 Punktemodell

**Basis:** Jedes Szenario hat einen Punktwert (`scenario.points`), grob 10 Punkte je
geschätzter Minute, gerundet auf Zehner.

**Modus-Multiplikator** — belohnt Eigenständigkeit:

| Modus | Faktor | Begründung |
|---|---|---|
| Explore | ×0,5 | Orientierung ist wertvoll, aber kein Kompetenznachweis |
| Guided | ×1,0 | Referenzwert |
| Challenge | ×2,0 | Selbstständige Lösung, echter Nachweis |

**Hinweise:** Ein Szenario besteht aus **Basispunkten (70 %)** und **Bonuspunkten (30 %)**.
Hinweise reduzieren ausschließlich den Bonus:

| Genutzte Hilfestufe | Bonusabzug je Schritt |
|---|---|
| Stufe 1 (Hinweis) | 10 % des Schrittbonus |
| Stufe 2 (Anweisung) | 25 % |
| Stufe 3 (visuelle Hilfe) | 50 % |

Im **Explore-Modus gibt es keinen Abzug** — dort ist Erklärung der Zweck.

Das ist bewusst so konstruiert: Wenn Hilfe spürbar bestraft wird, klicken unsichere Menschen
sie nicht an und scheitern still. Genau die Zielgruppe, um die es hier geht. Der Abzug muss
sichtbar, aber schmerzfrei sein.

**Fehlversuche** kosten **keine Punkte.** Sie werden erfasst und im Abschlussbericht gezeigt,
weil sie didaktisch interessant sind — aber Bestrafung von Versuchen widerspricht dem Lernziel
"ausprobieren trauen".

**Anti-Gaming:**
- Punkte je (Szenario-ID + Version) nur einmal. Wiederholungen erscheinen als "Übung" ohne Punkte.
- Ein Szenario, das schneller als 25 % der Schätzzeit abgeschlossen wird, wird als
  `suspect_fast` markiert und zählt nicht für Nachweise (verhindert Durchklicken).
- Punkte werden serverseitig berechnet, nie im Client.

## 5.3 Kompetenzprofil statt Highscore

Punkte aggregieren pro `Technology`, nicht global:

```
Kompetenzprofil — Max Mustermann

IDE (VS Code)                 ████████░░  Practitioner   420 SP
Source Control (Git)          █████░░░░░  Advanced Beginner 210 SP
AI Coding Assistant (Copilot) ███░░░░░░░  Novice         120 SP
Office Assistant (M365)       ░░░░░░░░░░  —                0 SP
```

| Stufe | Schwelle | Bedeutung |
|---|---|---|
| Novice | > 0 SP | erste Berührung |
| Advanced Beginner | ≥ 150 SP | Grundlagen geführt bewältigt |
| Practitioner | ≥ 400 SP inkl. ≥ 1 Challenge | selbstständig arbeitsfähig |
| Proficient | ≥ 800 SP inkl. ≥ 3 Challenges verschiedener Module | sicher, kann anleiten |

Schwellen sind Startwerte und nach dem Pilot zu kalibrieren.

## 5.4 Lernkontinuität statt Streaks

Tages-Streaks erzeugen Druck und funktionieren im Arbeitskontext nicht (Urlaub, Schichten,
Projektphasen). Stattdessen: **Wochenziel**, frei einstellbar (Standard 20 Minuten/Woche),
Anzeige der letzten 8 Wochen als ruhiges Balkendiagramm. Kein Verlust bei Unterbrechung,
keine Push-Erinnerung ohne Opt-in.

## 5.5 Kompetenznachweise (Attestation)

Der ökonomisch wertvollste Teil des Systems. Ein Nachweis entsteht, wenn alle Lernziele eines
Moduls **im Challenge-Modus** erfüllt wurden.

```yaml
attestation:
  id: att_2026_00123
  subject: { userId: u_889, displayName: "Max Mustermann" }
  module: vscode-basics
  learningObjectives: [understand_vscode_ui, understand_workspace, create_file]
  productVersion: "vscode@1.x"
  issuedAt: 2026-08-08
  validUntil: 2027-08-08          # 12 Monate
  evidence:
    mode: challenge
    hintsUsed: 1
    durationMinutes: 14
    scenarioVersion: vscode-basics.challenge@3
  issuer: "AI Training Lab"
  signature: "<hash>"
```

**Gültigkeitsdauer 12 Monate** ist kein Verkaufstrick, sondern fachlich notwendig: VS Code
und Copilot ändern ihre Oberflächen und Fähigkeiten mehrmals jährlich. Ein Nachweis von 2026
sagt 2029 nichts mehr aus. Die Re-Zertifizierung ist gleichzeitig das Geschäftsmodell für
wiederkehrende Nutzung.

**Verwendungszweck:** Nachweis der KI-Kompetenz-Anforderung des EU AI Act (Art. 4) sowie
interner Schulungsnachweis. Vor der Vermarktung als Compliance-Nachweis unbedingt rechtlich
prüfen lassen — die Auslegung entwickelt sich; das Produkt sollte den Nachweis dokumentieren,
nicht dessen Rechtswirkung behaupten.

## 5.6 Ranglisten und Mitbestimmung — kritischer Punkt

Ein Punktesystem, das Einzelpersonen vergleichbar macht, ist in Deutschland potenziell eine
Einrichtung zur Überwachung von Leistung und Verhalten der Beschäftigten und damit
**mitbestimmungspflichtig** (§ 87 Abs. 1 Nr. 6 BetrVG). Wenn hier später Firmenkunden
bedient werden sollen, entscheidet dieser Punkt über die Einführbarkeit.

Konstruktionsregeln, die das Risiko entschärfen:

1. **Ranglisten standardmäßig aus.** Aktivierung nur bewusst durch den Mandanten.
2. **Drei Sichtbarkeitsstufen** pro Mandant konfigurierbar:
   - `private` — nur die lernende Person sieht ihre Punkte (Standard)
   - `aggregate` — Führungskräfte sehen nur Team-Kennzahlen ab n ≥ 5 Personen
   - `named` — namentliche Auswertung (nur mit dokumentierter Betriebsvereinbarung)
3. **Keine Auswertung von Fehlversuchen auf Personenebene** für Führungskräfte. Fehlversuche
   sind Lerndaten, keine Leistungsdaten.
4. **Transparenz-Ansicht für Lernende:** "Diese Daten werden über mich gespeichert und wer
   sie sieht" — als feste Seite im Produkt, nicht als Datenschutzerklärung im Fußbereich.
5. Aufbewahrungsfrist für Roh-Events standardmäßig 90 Tage, danach nur Aggregate.

Empfehlung: Diese Regeln als Produktmerkmal vermarkten ("betriebsratsfähig ab Werk"), nicht
als Einschränkung. Das ist im deutschen Markt ein echtes Differenzierungsmerkmal.

## 5.7 Was bewusst nicht gebaut wird

- Punkte gegen Prämien oder Geld
- Öffentliche Einzelranglisten als Standard
- Zeitdruck-Mechaniken oder Countdown im Lernmodus
- Verlust bereits erworbener Punkte
- Tages-Streaks mit Verfallslogik
