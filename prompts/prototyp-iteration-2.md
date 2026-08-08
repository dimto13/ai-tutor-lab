# Prototyp — Iteration 2: Refaktorierung zur generischen Training Engine

> **Zweck:** Der bestehende POC soll **nicht neu gebaut**, sondern intern umgebaut werden.
> Die vorhandene UX bleibt erhalten oder wird besser — die Architektur wird generisch.
> Nach dieser Iteration folgt der Export ins eigene Git-Repository (Ticket `AITP-80`).

Prompt-Text zum Einfügen in das verwendete Prototyping-Werkzeug:

---

Du arbeitest an einer bestehenden Anwendung ("AI Training Lab"). Baue sie **nicht neu**.
Refaktoriere sie intern, ohne die bestehende Nutzeroberfläche und den Trainingsablauf zu
verschlechtern. Arbeite die folgenden Punkte in dieser Reihenfolge ab.

## 1. Architekturregeln (gelten für alles Folgende)

- Die Trainingslogik darf **keine React-Komponente kennen**. Lege sie in `src/training/`
  als reines TypeScript ohne React-Import ab.
- Szenarien dürfen **kein DOM kennen**. Kein CSS-Selektor in Szenariodaten. Highlight-Ziele
  sind semantische IDs wie `vscode.activityBar.explorer`.
- Der VS-Code-Simulator darf **keine Trainingslogik** enthalten. Er emittiert nur Events
  und beantwortet Zustandsabfragen.
- Es darf **kein Hersteller im Dateinamen** vorkommen (kein `MicrosoftTraining.ts`).

## 2. Zielstruktur

```
src/
  app/          dashboard/ training/
  catalog/      technologies/ providers/ products/
  training/     engine/ state-machine/ validators/ events/
  runtimes/     core/ vscode-simulator/ terminal-simulator/
  scenarios/    vscode-basics/ git-basics/ copilot-basics/
  components/   platform-shell/ training-guide/ tutor/ overlay/
```

## 3. Datenmodell einführen

Lege einen Technologie-Katalog an: `Technology → Provider → Product → ProductVersion →
Capability`. GitHub Copilot ist **kein Teil von VS Code**, sondern ein eigenes Produkt mit
`hostProductId: "vscode"`.

Lege die Inhaltshierarchie an: `Curriculum → Course → Module → Scenario → Step`.
Jedes Modul hat genau eine `learningLayer`: `tool`, `concept` oder `ai_workflow`.

Ein Szenario referenziert seine Umgebung nur so:

```ts
environment: { productId: "vscode", version: "1.x", runtimeAdapterId: "vscode-simulator" }
```

## 4. Runtime-Adapter-Interface

```ts
interface RuntimeAdapter {
  id: string; productId: string; capabilities: Capability[];
  mount(el: HTMLElement, seed?: unknown): Promise<void>;
  unmount(): Promise<void>;
  subscribe(handler: (e: TrainingEvent) => void): () => void;
  query<T>(selector: string): Promise<T>;
  resolveTarget(ref: string): DOMRect | null;
  describeSurface(): Array<{ ref: string; label: string; conceptKey?: string }>;
  snapshot(): Promise<unknown>;
  restore(s: unknown): Promise<void>;
}
```

Der VS-Code-Simulator und der Terminal-Simulator implementieren dieses Interface.
Die Overlay-Engine benutzt ausschließlich `resolveTarget`.

## 5. VS-Code-Simulator realistisch machen

Die Oberfläche muss die **Informationsarchitektur korrekt wiedergeben**, weil genau diese
gelehrt werden soll:

```
┌──────────────────────────────────────────────────────────┐
│ File Edit Selection View Go Run Terminal Help            │
├───┬────────────────┬─────────────────────────────────────┐
│ A │ EXPLORER       │ hello.py  ×                         │
│ c │                ├─────────────────────────────────────┤
│ t │ WORKSPACE      │                                     │
│ i │ ├ src          │ Editor                              │
│ v │ ├ README.md    │                                     │
│ i │ └ hello.py     │                                     │
│ t │                ├─────────────────────────────────────┤
│ y │                │ TERMINAL  PROBLEMS  OUTPUT          │
├───┴────────────────┴─────────────────────────────────────┤
│ ⎇ main                                      Python 3.x   │
└──────────────────────────────────────────────────────────┘
```

Pflicht:
- Menüleiste mit aufklappbaren Menüs (File, Edit, Selection, View, Go, Run, Terminal, Help)
- Activity Bar mit Explorer, Search, Source Control, Extensions
- Side Bar, Editor mit Tabs, Panel mit den Tabs Terminal / Problems / Output
- Statusleiste mit Branch und Sprachumgebung
- **Ordner öffnen** und **Workspace öffnen** sind zwei unterscheidbare Vorgänge mit
  unterschiedlichen Folgen. Ein Workspace kann mehrere Ordner und eigene Einstellungen haben.

## 6. Drei Trainingsmodi

- **Explore** — der Nutzer klickt frei auf Oberflächenbereiche, das System erklärt jedes
  Element. Keine Fehlermeldungen, kein Zeitdruck. Fortschritt = Anteil erkundeter Elemente.
- **Guided** — wie bisher, Schritt für Schritt mit Overlay und drei Hilfestufen.
- **Challenge** — nur Zielbeschreibung, kein Overlay, Prüfung des **Endzustands** über
  `query()`, nicht der Klickreihenfolge. Tutor nur auf ausdrückliche Anfrage.

## 7. Validierung verbessern

Validatoren liefern drei Ergebnisse: `pass`, `near-miss`, `ignore`.
Nur `near-miss` erzeugt Nutzerfeedback. Beispiel: `file.created` mit falschem Dateinamen ist
`near-miss` und zeigt die konfigurierte Meldung; eine Cursorbewegung ist `ignore` und darf
**keine** Meldung erzeugen.

Fehlversuche werden gezählt, kosten aber keine Punkte.

## 8. Punktesystem einführen

- Szenario hat Basispunkte, aufgeteilt in 70 % Basis und 30 % Bonus.
- Modus-Multiplikator: Explore ×0,5, Guided ×1,0, Challenge ×2,0.
- Hinweise reduzieren **nur den Bonus**: Stufe 1 −10 %, Stufe 2 −25 %, Stufe 3 −50 % des
  jeweiligen Schrittbonus. Im Explore-Modus kein Abzug.
- Punkte aggregieren zu einem **Kompetenzprofil je Technology** mit den Stufen
  Novice / Advanced Beginner / Practitioner / Proficient.
- Darstellung ruhig und professionell: Fortschrittsringe und Kompetenzmatrix.
  **Kein Konfetti, keine Maskottchen, keine Tages-Streaks, keine öffentliche Rangliste.**

## 9. Bestehenden Kurs migrieren

Der vorhandene Git/VS-Code/Copilot-Kurs wird vollständig aus den Komponenten herausgezogen
und als deklarative Szenariodefinition abgelegt. Der Ablauf bleibt für Nutzer identisch.

## 10. Zweiten Technologie-Prototyp ergänzen

Füge ein kleines zweites Modul mit einem eigenen Runtime-Adapter hinzu — **Claude Code**
(CLI-Agent), **M365 Copilot** oder ein **Classification-Simulator** (Dokumentvorschau mit
Zuordnungsinteraktion für ein Modul "Datenklassifizierung", nur synthetische
Beispieldokumente). Vier bis fünf Schritte genügen. Zweck ist ausschließlich
der Nachweis, dass Engine, Overlay, Tutor und Punktesystem ohne Änderung funktionieren.

## 11. Abnahmekriterien dieser Iteration

- [ ] Keine Szenariodaten mehr in React-Komponenten
- [ ] Kein CSS-Selektor in Szenariodaten
- [ ] `src/training/` enthält keinen React-Import
- [ ] Der VS-Code-Simulator zeigt Menüleiste, Activity Bar, Side Bar, Editor mit Tabs,
      Panel mit drei Tabs und Statusleiste
- [ ] Ordner öffnen und Workspace öffnen sind unterscheidbar
- [ ] Alle drei Modi sind für mindestens ein Modul lauffähig
- [ ] Das zweite Technologie-Modul läuft ohne Änderung an der Training Engine
- [ ] Der bestehende Trainingsablauf funktioniert unverändert oder besser
