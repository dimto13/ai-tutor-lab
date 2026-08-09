# 02 — Domänenmodell

Dieses Dokument ist die **verbindliche Begriffs- und Datengrundlage**. Jedes Modell, das an
diesem Projekt arbeitet, sollte es vorgelegt bekommen.

## 2.1 Zwei getrennte Bäume

Der zentrale Architekturgedanke: **Was gelernt wird** und **woran gelernt wird** sind zwei
unabhängige Hierarchien. Sie berühren sich an genau einer Stelle — im Szenario.

```
LERNINHALT                              TECHNOLOGIE-KATALOG

Tenant                                  Technology            z. B. "AI Coding Assistant"
 └── Curriculum                          └── Provider         z. B. GitHub
      └── Course                              └── Product     z. B. GitHub Copilot
           └── Module                              └── ProductVersion
                └── Scenario  ────────┐                 └── Capability[]
                     └── Step         │                       └── RuntimeAdapter
                                      │
                     Scenario.environment = { productId, version, runtimeAdapterId }
```

**Warum so:** Ein Unternehmen sagt "unsere Leute sollen mit einem AI Coding Assistant arbeiten
können" — nicht "unsere Leute sollen GitHub Copilot 1.2 können". Die Technology-Ebene macht
Curricula anbieterunabhängig und später vergleichbar. Gleichzeitig verhindert die Trennung,
dass für "VS Code + Copilot", "VS Code + Amazon Q" und "VS Code + Claude Code" drei
VS-Code-Simulatoren gebaut werden.

### Anti-Pattern (nicht so bauen)

```
MicrosoftTraining.ts    ❌  Hersteller als Codestruktur
VSCodeCopilotSteps.tsx  ❌  Szenario in React-Komponente
overlay.querySelector(".explorer-icon")  ❌  Szenario kennt DOM
```

## 2.2 Entitäten

### Technologie-Katalog

| Entität          | Beschreibung                                       | Beispiel                                                                                                      |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Technology`     | Werkzeugklasse, das eigentliche Lernziel           | IDE, Source Control, AI Coding Assistant, CLI Agent, Office Assistant, AI Chat                                |
| `Provider`       | Hersteller                                         | Microsoft, GitHub, Anthropic, OpenAI, Google, Amazon                                                          |
| `Product`        | Konkretes Produkt einer Technology eines Providers | VS Code, GitHub Copilot, Claude Code, M365 Copilot                                                            |
| `ProductVersion` | Versionsstand, an dem gelehrt wird                 | `vscode@1.9x`                                                                                                 |
| `Capability`     | Was die Laufzeit kann                              | `filesystem`, `editor`, `terminal`, `extensions`, `source_control`, `chat`, `inline_completion`, `agent_mode` |
| `Integration`    | Produkt läuft _in_ einem anderen Produkt           | `github-copilot` hostet in `vscode`                                                                           |
| `RuntimeAdapter` | Technische Umsetzung einer Laufzeit                | `vscode-simulator` (heute), `code-server` (später)                                                            |

### Lerninhalt

| Entität             | Beschreibung                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `Curriculum`        | Lernpfad einer Rolle/Zielgruppe, z. B. "KI-Grundbefähigung Fachbereich"                                |
| `Course`            | Zusammenhängender Kurs, z. B. "Entwickeln mit VS Code und Copilot"                                     |
| `Module`            | Kleinste vermarktbare Lerneinheit, hat genau **eine** `learningLayer` (`tool`/`concept`/`ai_workflow`) |
| `Scenario`          | Durchführbare Übung in einem Modus (`explore`/`guided`/`challenge`), gebunden an eine Umgebung         |
| `Step`              | Einzelner Trainingsschritt mit Aufgabe, Hilfestufen, Validierung, Highlight-Ziel                       |
| `LearningObjective` | Lernziel-ID, referenzierbar über Module hinweg (Grundlage für Nachweise)                               |

### Laufzeit / Fortschritt

| Entität           | Beschreibung                                                                       |
| ----------------- | ---------------------------------------------------------------------------------- |
| `TrainingSession` | Ein Durchlauf eines Szenarios durch eine Person                                    |
| `StepState`       | `NOT_STARTED` → `ACTIVE` → (`VALIDATION_FAILED`) → `COMPLETED` / `SKIPPED`         |
| `TrainingEvent`   | Alles, was in der Laufzeit passiert (Grundlage für Validierung **und** Telemetrie) |
| `Attempt`         | Fehlversuch mit Grund                                                              |
| `HintUsage`       | Genutzte Hilfestufe je Schritt                                                     |
| `SkillProfile`    | Aggregierte Punkte/Level je Technology (siehe `05-gamification.md`)                |
| `Attestation`     | Kompetenznachweis mit Gültigkeitszeitraum                                          |

### Datenklassifizierung (siehe `docs/10-dokumenten-check.md`)

| Entität                | Beschreibung                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ClassificationScheme` | Mandantenspezifisches Schema: Stufen in Rangfolge, Merkmale mit Mindeststufe, KI-Freigabematrix, Unsicherheitsregel    |
| `ClassificationLevel`  | Vertraulichkeitsstufe (Standard: public → internal → confidential → strictly_confidential)                             |
| `Indicator`            | Merkmal, das eine Mindeststufe auslöst (Personenbezug, Gehaltsdaten, Kennzeichnung …)                                  |
| `AiToolPolicy`         | Je KI-Werkzeug die höchste erlaubte Stufe                                                                              |
| `DocumentCheckResult`  | Metadaten eines Prüfvorgangs: Zeitpunkt, Dateityp, Ergebnisstufe, ausgelöste Merkmals-IDs — **niemals Dokumentinhalt** |

## 2.3 TypeScript-Contracts (verbindlich)

```ts
// ---------- Katalog ----------
export type TechnologyId =
  | "ide"
  | "source_control"
  | "terminal"
  | "ai_coding_assistant"
  | "cli_agent"
  | "office_assistant"
  | "ai_chat";

export interface Product {
  id: string; // 'vscode'
  providerId: string; // 'microsoft'
  technologyId: TechnologyId; // 'ide'
  name: string;
  hostProductId?: string; // 'github-copilot' läuft in 'vscode'
}

export type Capability =
  | "filesystem"
  | "editor"
  | "terminal"
  | "extensions"
  | "source_control"
  | "chat"
  | "inline_completion"
  | "agent_mode";

// ---------- Lerninhalt ----------
export type LearningLayer = "tool" | "concept" | "ai_workflow";
export type TrainingMode = "explore" | "guided" | "challenge";

export interface Scenario {
  id: string; // 'vscode-basics.guided'
  moduleId: string;
  mode: TrainingMode;
  title: string;
  description: string;
  learningObjectives: string[]; // ['understand_vscode_ui', 'understand_workspace']
  environment: {
    productId: string;
    version: string; // SemVer-Range, z. B. '1.x'
    runtimeAdapterId: string; // 'vscode-simulator'
    seed?: RuntimeSeed; // Startzustand: Dateibaum, offene Tabs, Repo-Status
  };
  steps: Step[];
  estimatedMinutes: number;
  points: number; // Basispunkte, siehe Gamification
}

export interface Step {
  id: string;
  title: string;
  instruction: string; // was der Nutzer tun soll
  rationale?: string; // Antwort auf "Warum mache ich das?"
  helpLevels: [string, string, string]; // Hinweis → konkrete Anweisung → visuelle Hilfe
  highlightTarget?: UiTargetRef; // semantisch, NIE ein CSS-Selektor
  validation: Validation;
  optional?: boolean;
  onFailure?: { message: string; markTarget?: UiTargetRef };
}

/** Semantische UI-Referenz. Der RuntimeAdapter löst sie in Bildschirmkoordinaten auf. */
export type UiTargetRef = string; // 'vscode.activityBar.explorer', 'vscode.panel.terminal'

// ---------- Events ----------
export interface TrainingEvent<P = unknown> {
  id: string;
  source: string; // 'vscode-simulator'
  type: string; // 'file.created'
  timestamp: string; // ISO 8601
  sessionId: string;
  payload: P;
}
```

Kanonische Event-Typen (erweiterbar, aber nicht umbenennen):

```
workspace.opened        repository.opened      explorer.opened
file.created            file.updated           file.deleted           file.opened
editor.selection.changed
terminal.opened         terminal.command.executed
scm.staged              scm.committed
ai.prompt.submitted     ai.suggestion.accepted ai.suggestion.rejected
ui.element.inspected    (Explore-Modus)
```

### Validierung — deklarativ, nicht imperativ

```ts
export type Validation =
  | { kind: "event"; type: string; match?: Record<string, unknown> }
  | { kind: "state"; selector: string; equals?: unknown; matches?: string }
  | { kind: "sequence"; of: Validation[]; ordered: boolean }
  | { kind: "all" | "any"; of: Validation[] }
  | {
      kind: "classification";
      documentId: string;
      expectedLevel: string;
      expectedAiDecision?: Record<string, boolean>;
    }
  | { kind: "llm-rubric"; rubric: string; input: string }; // nur für AI-Workflow-Schritte
```

**Wichtig für den Challenge-Modus:** Dort wird nicht die Event-Kette geprüft, sondern der
**Endzustand** (`kind: 'state'`). Der Weg dorthin ist dem Nutzer überlassen. Genau deshalb
braucht der Adapter eine Query-Fähigkeit und nicht nur einen Event-Stream.

### Runtime-Adapter-Interface

```ts
export interface RuntimeAdapter {
  readonly id: string;
  readonly productId: string;
  readonly capabilities: Capability[];

  mount(container: HTMLElement, seed?: RuntimeSeed): Promise<void>;
  unmount(): Promise<void>;

  /** Event-Strom in die Training Engine */
  subscribe(handler: (e: TrainingEvent) => void): () => void;

  /** Zustandsabfrage für state-basierte Validierung */
  query<T = unknown>(selector: string): Promise<T>;

  /** Overlay-Auflösung: semantisches Ziel → Bildschirmrechteck */
  resolveTarget(ref: UiTargetRef): DOMRect | null;

  /** Für Explore-Modus: alle inspizierbaren Elemente mit Erklärtext-Schlüssel */
  describeSurface(): Array<{ ref: UiTargetRef; label: string; conceptKey?: string }>;

  /** Persistenz einer Session */
  snapshot(): Promise<unknown>;
  restore(snap: unknown): Promise<void>;
}
```

`resolveTarget` und `describeSurface` sind der Grund, warum die Overlay-Engine später auch
gegen ein echtes code-server-iFrame funktionieren kann: Das Szenario spricht nie über DOM,
sondern immer über semantische Referenzen.

## 2.4 Beispiel-Szenario (Autorenformat)

```yaml
id: vscode-basics.guided
moduleId: vscode-basics
mode: guided
title: VS Code Oberfläche — geführte Übung
learningObjectives: [understand_vscode_ui, understand_workspace, create_file]
environment:
  productId: vscode
  version: "1.x"
  runtimeAdapterId: vscode-simulator
  seed:
    workspace: ai-training-demo
    files: [README.md, src/, docs/]
estimatedMinutes: 12
points: 100
steps:
  - id: open-explorer
    title: Explorer öffnen
    instruction: Öffne den Explorer in der Activity Bar.
    rationale: Der Explorer zeigt die Datei- und Ordnerstruktur deines Workspaces.
    helpLevels:
      - Der Explorer befindet sich links in der Activity Bar.
      - Klicke auf das oberste Symbol (zwei übereinanderliegende Dokumente).
      - __highlight__
    highlightTarget: vscode.activityBar.explorer
    validation: { kind: event, type: explorer.opened }

  - id: create-file
    title: Datei anlegen
    instruction: Erstelle im Projektverzeichnis eine Datei hello.py.
    helpLevels:
      [
        "Nutze das Neue-Datei-Symbol im Explorer.",
        "Explorer → Symbolleiste → Neue Datei → Namen eingeben → Enter",
        "__highlight__",
      ]
    highlightTarget: vscode.explorer.newFile
    validation: { kind: event, type: file.created, match: { filename: hello.py } }
    onFailure:
      message: Fast richtig. Für diese Übung brauchen wir genau den Dateinamen hello.py.
      markTarget: vscode.explorer.tree
```

## 2.5 Persistenzmodell (MVP)

| Datenklasse                   | Speicher                                          | Begründung                                                                                |
| ----------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Katalog + Szenarien           | Git-Repository, JSON-Schema-validiert             | Versionierbar, reviewbar, von LLMs erzeugbar, kein Datenbank-Deployment für Content nötig |
| Fortschritt, Sessions, Punkte | Datenbank (Amplify Data / DynamoDB oder Postgres) | Nutzerbezogen, veränderlich                                                               |
| Events / Telemetrie           | Append-only Log, getrennt, mit Aufbewahrungsfrist | Datenschutzrechtlich eigene Klasse (→ `docs/08` ADR-07)                                   |
| Nachweise (`Attestation`)     | Datenbank + signierter Export                     | Prüffähigkeit                                                                             |

Szenarien referenzieren Produktversionen. Wird ein Simulator aktualisiert, entsteht eine neue
Szenario-Version — bereits vergebene Punkte und Nachweise bleiben an die alte Version gebunden
(siehe Anti-Gaming und Re-Zertifizierung in `05-gamification.md`).
