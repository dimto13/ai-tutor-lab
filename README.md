# AI Training Lab

Interaktive Trainingsplattform für reale Softwareoberflächen mit semantisch adressierbaren Simulatoren, deklarativen Lerninhalten und mehreren Trainingsmodi.

## Entwicklung

```bash
npm ci --install-strategy=nested
npm run dev:local
```

Node.js 22 ist die unterstützte Laufzeit (`.nvmrc`).

## Qualitätssicherung

Feature-Branches laufen durch GitHub Actions mit reproduzierbarer Installation, Content-Validierung, Lint, Typecheck, Runtime-Contract-Tests, Build und Browser-E2E-Tests.

## Aufgabenverwaltung

GitHub Issues sind die alleinige Quelle für Aufgaben, Akzeptanzkriterien, Priorität, Milestone und Abhängigkeiten. Die Dateien unter `backlog/` sind nur noch ein eingefrorenes Archiv der Erstplanung.

Änderungen an `main` erfolgen über Pull Requests.

## Architektur

Die Anwendung trennt deklarative Trainingsinhalte von Produkt- und Runtime-Verhalten. Simulatoren exponieren semantische UI-Ziele über den `RuntimeAdapter`; Szenarien enthalten keine CSS-Selektoren oder DOM-Abhängigkeiten.

Der Tutor besitzt eine deterministische Stufe aus Content-Daten. Die optionale LLM-Schicht ist providerneutral und lokal auf Ollama ausgerichtet; der lokale Standard ist `gemma4:31b`, mit `gemma4:e4b` als bewusst manuell konfigurierbarem kleineren Ausweichmodell.

## Zielplattform

Das spätere Hosting ist AWS Amplify mit serverseitiger Ausführung für sicherheitsrelevante Provider- und Persistenzfunktionen. Cloud-Provider und produktive Zugangsdaten gehören nicht in das Repository.
