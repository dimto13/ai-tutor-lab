# Monorepo-Architektur

## Ziel

Die Repository-Struktur trennt die deploybare Web-Anwendung von den wiederverwendbaren Trainings- und Runtime-Bausteinen. Diese Grenze ist zugleich die Voraussetzung dafür, AWS-Deployment, weitere Simulatoren und eine spätere reale Runtime zu ergänzen, ohne die Training Engine an React, DOM oder einen einzelnen Anbieter zu koppeln.

## Struktur

```text
apps/
  web/                         TanStack-Start-Anwendung und React-UI
packages/
  training-engine/             frameworkfreie Trainingsdomäne und State Machine
  runtime-core/                RuntimeAdapter- und Übergangsverträge
  runtime-vscode-sim/          VS-Code-Simulator
  runtime-terminal-sim/        Terminal-Simulator
  catalog/                     Technology-/Provider-/Product-Katalog
content/
  scenarios/                   deklarative Trainingsszenarien
```

Der Root-`package.json` verwaltet `apps/*` und `packages/*` als npm Workspaces. `npm run check` bleibt der zentrale Quality-Gate-Einstieg und führt Formatierung, Content-Validierung, Lint, Typecheck, Package-Tests, Katalog-/Runtime-Tests und den Produktionsbuild aus.

## Abhängigkeitsrichtung

Die zulässige Richtung lautet:

```text
apps/web
   |
   v
packages/*
```

Packages dürfen die Web-Anwendung nicht importieren. Diese Regel wird per ESLint erzwungen. `packages/training-engine` ist zusätzlich frei von React und React DOM und muss mit Node allein typprüf- und testbar bleiben.

## Training Engine

`packages/training-engine` enthält die fachlichen Verträge für:

- `Curriculum -> Course -> Module -> Scenario -> Step`
- Training-Sessions und die Zustände `NOT_STARTED`, `ACTIVE`, `VALIDATION_FAILED`, `COMPLETED`, `SKIPPED`
- deklarative Validatoren `event`, `state`, `sequence`, `all`, `any`
- dreiwertige Validierung `pass | near-miss | ignore`
- kanonische `TrainingEvent`-Hülle
- In-Process-EventBus und `TelemetrySink`

Die Engine kennt weder React noch LocalStorage, Amplify oder andere Browser-/Cloud-SDKs. Persistenz und UI bleiben Ports beziehungsweise Adapter außerhalb der Engine.

## Runtime-Grenze

`runtime-core` definiert die gemeinsame Adaptergrenze. Simulatoren liefern Events, Query-Zustände, semantische Zielreferenzen sowie Snapshot/Restore, kennen aber keine Trainingsschrittfolge.

`CanonicalTrainingEventType` beschreibt die stabile, produktübergreifende Ereignissprache. Die `TrainingEvent`-Hülle lässt den Transport zusätzlicher runtime-spezifischer Eventtypen zu, damit neue Adapter keine Änderung an der Engine erzwingen.

## Kompatibilität

Der Monorepo-Umbau ändert keine bestehenden Szenario-IDs und keine Persistenzschlüssel. Bereits gespeicherter Lernfortschritt bleibt damit adressierbar. Übergangs-Re-Exports in `apps/web/src` halten bestehende Imports während der schrittweisen Migration stabil.

## Deployment

AITP-82 baut auf dieser Struktur auf. Amplify-Konfiguration, Build-Pfade und Artefaktverzeichnisse werden deshalb erst gegen das Monorepo festgelegt und nicht mehr gegen die frühere Root-App.
