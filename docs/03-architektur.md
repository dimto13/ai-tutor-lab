# 03 — Architektur

## 3.1 Leitprinzipien

| #   | Prinzip                                     | Konsequenz                                                                        |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| A1  | Trainingslogik kennt keine React-Komponente | `packages/training-engine` hat keine UI-Abhängigkeit und ist ohne Browser testbar |
| A2  | Szenario kennt kein DOM                     | Highlighting über `UiTargetRef`, aufgelöst vom Adapter                            |
| A3  | Simulator kennt keine Trainingslogik        | Der Simulator emittiert nur Events und beantwortet Queries                        |
| A4  | Transport ist austauschbar                  | Heute lokaler Event-Bus, später WebSocket — gleiche `TrainingEvent`-Struktur      |
| A5  | Content ist Daten, kein Code                | Szenarien als YAML/JSON im Repository, schema-validiert                           |
| A6  | Jede Fähigkeit hinter einer Capability      | Ein Szenario, das `terminal` braucht, prüft die Capability, nicht das Produkt     |

## 3.2 Schichtenmodell (Zielbild MVP)

```
┌───────────────────────────────────────────────────────────────┐
│ PLATFORM SHELL (React/TS/Tailwind)                            │
│ Dashboard · Training-View · Guide-Panel · Tutor · Overlay      │
└──────────────────────────┬──────────────────────────────────┘
                           │ nur über Ports, keine Direktzugriffe
┌──────────────────────────▼──────────────────────────────────┐
│ TRAINING ENGINE (frameworkfrei, packages/training-engine)      │
│ ┌────────────┐ ┌──────────────┐ ┌───────────┐ ┌─────────────┐ │
│ │ Curriculum │ │ StateMachine │ │ Validator │ │ Scoring     │ │
│ │ Resolver   │ │              │ │ Registry  │ │ Engine      │ │
│ └────────────┘ └──────────────┘ └───────────┘ └─────────────┘ │
│                    Event Bus (in-process)                      │
└──────────────────────────┬──────────────────────────────────┘
                           │ RuntimeAdapter-Interface
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
  vscode-simulator   terminal-simulator   m365-simulator
        │                  │                  │
        └── später ────────┴──────────────────┴───► echte Runtime
                                                   (code-server, Shell, API)
┌───────────────────────────────────────────────────────────────┐
│ TUTOR SERVICE   Kontext = Szenario, Schritt, Historie, Events   │
│ Stufe 1 regelbasiert · Stufe 2 LLM mit Guardrails               │
└───────────────────────────────────────────────────────────────┘
```

## 3.3 Overlay-Engine

Der Kern der visuellen Führung, und die Komponente mit dem größten Fehlerpotenzial.

Ablauf:

1. Engine setzt Schritt auf `ACTIVE` und meldet `highlightTarget`.
2. Overlay fragt `adapter.resolveTarget(ref)` → `DOMRect`.
3. Overlay rendert Maske (Rest abgedunkelt), Rahmen um das Ziel, Tooltip daneben.
4. Das Zielelement bleibt klickbar — die Maske hat dort ein Loch, kein `pointer-events: none` über allem.
5. `ResizeObserver` + `MutationObserver` halten das Rechteck aktuell; bei Scroll im iFrame
   liefert der Adapter die Koordinaten, nicht die Shell.
6. Wird `resolveTarget` `null` (Element nicht sichtbar), zeigt das Overlay **keine** falsche
   Markierung, sondern degradiert auf Textanweisung. Stille Fehlmarkierungen zerstören Vertrauen
   schneller als eine fehlende Markierung.

Anforderung an Barrierefreiheit: Highlight darf nicht die einzige Informationsquelle sein
(→ `NFR-08`). Der Tooltip-Text muss dieselbe Aussage transportieren.

## 3.4 Event- und Validierungsfluss

```
Nutzer klickt im Simulator
        │
        ▼
Simulator emittiert TrainingEvent { source, type, payload }
        │
        ▼
Event Bus ──► Telemetrie-Sink (Log, gepuffert)
        │
        ▼
Training Engine: aktiver Schritt? → Validator ausführen
        │
        ├─ erfüllt ──► Step COMPLETED → Scoring → nächster Schritt ACTIVE → Overlay-Update
        └─ nicht erfüllt und "Beinahe-Treffer" ──► VALIDATION_FAILED + onFailure.message
```

**Beinahe-Treffer-Erkennung** (aus dem POC-Fehlerverhalten): Ein `file.created` mit falschem
Namen ist etwas anderes als ein irrelevantes Event. Der Validator meldet deshalb drei
Ergebnisse: `pass` / `near-miss` (mit Begründung) / `ignore`. Nur `near-miss` erzeugt eine
Fehlermeldung im Guide-Panel — sonst wird der Nutzer bei jeder Mausbewegung getadelt.

## 3.5 Tutor-Architektur

```
TutorContext = {
  scenario, mode, currentStep, completedSteps,
  lastEvents (n=10), hintsUsed, failedAttempts,
  runtimeSnapshotSummary
}
```

Zwei Stufen:

- **Stufe 1 (MVP-Pflicht, deterministisch):** Antworten aus dem Content — `step.rationale`,
  `helpLevels`, `conceptKey`-Glossar. Kein LLM. Immer korrekt, immer verfügbar, kein Datenabfluss.
- **Stufe 2 (optional, LLM):** Freie Fragen. Guardrails:
  - Systemprompt bekommt den vollständigen aktuellen Schritt und die Regel, **nie** eine
    UI-Anweisung zu erfinden, die nicht im Content steht.
  - Antworten, die eine Handlung vorschlagen, müssen auf einen `UiTargetRef` verweisen, der
    im Adapter existiert — sonst wird die Antwort auf eine Rückfrage reduziert.
  - Kein Weiterreichen von Nutzercode an das Modell ohne Tenant-Opt-in.

Das ist bewusst konservativ: Ein Tutor, der Einsteigern eine nicht existierende Menüoption
beschreibt, richtet mehr Schaden an als kein Tutor.

## 3.6 Deployment-Stufen

### Stufe A — heute bis MVP (AWS Amplify)

```
Amplify Hosting (React/Vite)
   ├── Amplify Auth (Cognito, später OIDC-Föderation zum Firmen-IdP)
   ├── Amplify Data (Fortschritt, Punkte, Sessions)
   ├── Amplify Functions (Tutor-Proxy, Nachweis-Export)
   └── Content aus dem Build (Szenarien als statische Assets)
```

Amplify Gen 2 ist code-first in TypeScript und unterstützt Monorepos — passt zur oben
vorgeschlagenen Repostruktur. Prüfe die aktuelle Amplify-Dokumentation vor der Umsetzung,
Gen-2-APIs bewegen sich noch.

### Stufe B — echte Runtimes (nach MVP)

```
Amplify Hosting  ──►  Control Plane (API Gateway + Lambda/Fargate)
                          │
                          ├── WebSocket API   (bidirektionale Events)
                          └── Runtime Layer   (ECS/EKS: code-server, Shell, CLI-Agenten)
                                 └── pro Nutzer isoliert, PVC/EFS, Idle-Reclaimer
```

Amplify bleibt in Stufe B Frontend-Delivery und Teil des Application-Backends. Es ist
**nicht** die Runtime-Plattform. Diese Grenze früh zu ziehen verhindert einen späteren
Komplettumbau.

### Kostenwarnung für Stufe B

Eine echte Runtime pro Nutzer ist der teuerste Teil des Produkts. Grobe Größenordnung: ein
code-server-Container mit 1 vCPU/2 GB kostet bei aktiven Sitzungen ein Vielfaches der
Simulator-Variante, plus Storage und Idle-Zeiten. Deshalb die Empfehlung:

> **Hybrid-Strategie:** Explore- und Guided-Szenarien laufen dauerhaft im Simulator
> (billig, stabil, keine Wartezeit). Nur Challenge-Szenarien und Zertifizierungen laufen in
> der echten Runtime. Damit sinkt die Runtime-Last auf einen Bruchteil, und das Argument
> "gelernt an der Attrappe" ist entkräftet.

Diese Entscheidung ist als `ADR-01` festgehalten und sollte bewusst getroffen werden.

## 3.7 Teststrategie

| Ebene    | Gegenstand                                                                                                                        | Werkzeug              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Unit     | State Machine, Validatoren, Scoring                                                                                               | Vitest, ohne DOM      |
| Contract | Jeder `RuntimeAdapter` gegen eine gemeinsame Testsuite                                                                            | Vitest                |
| Content  | Alle Szenarien gegen JSON-Schema + Referenzprüfung (`UiTargetRef` existiert im Adapter, `learningObjective` existiert im Katalog) | CI-Skript             |
| E2E      | Ein Szenario komplett durchklicken, je Modus                                                                                      | Playwright            |
| Didaktik | Completion-Rate, Hinweisnutzung, Abbruchpunkte                                                                                    | Telemetrie-Auswertung |

Die Content-Prüfung ist die wichtigste und am leichtesten zu übersehende: Ein Szenario, das
auf ein nicht existierendes UI-Ziel zeigt, fällt sonst erst beim Nutzer auf.
