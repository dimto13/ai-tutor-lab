# AI Training Lab

Interaktive KI-Schulungsplattform für Unternehmen: Mitarbeitende ohne technische
Vorkenntnisse lernen in einer geführten Browser-Umgebung, Werkzeuge zu bedienen **und**
KI produktiv darin einzusetzen — simulierte Arbeitsumgebung, automatische
Schrittvalidierung, kontextbewusster Tutor.

Der erste UI-Entwurf entstand in einer externen Prototyping-Umgebung. Dieser POC ist nur noch
historischer Ursprung. **Verbindlicher Projektstand und einzige Source of Truth ist dieses
Git-Repository.** Entwicklung, Tests und Builds erfolgen unabhängig davon; Zielplattform für
Hosting und Deployment ist AWS Amplify.

## Orientierung im Repository

| Bereich | Inhalt |
|---|---|
| [`docs/`](docs/README.md) | **Produkt- und Anforderungsdokumentation** — Vision, Domänenmodell, Architektur, Anforderungen, Gamification, Roadmap, offene Entscheidungen |
| [`backlog/backlog.yaml`](backlog/backlog.yaml) | Single Source of Truth: 71 Tickets in 13 Epics |
| [`prompts/model-briefing.md`](prompts/model-briefing.md) | Kontext-Briefing für jede LLM-Sitzung an diesem Projekt |
| [`scripts/`](scripts/) | Backlog-Generator und GitHub-Issue-Sync |
| `src/` | POC-Quellcode (React/TypeScript/Vite) — wird gemäß Meilenstein M1 refaktoriert |
| [`docs/archiv/`](docs/archiv/poc-spezifikation.md) | Ursprüngliche POC-Spezifikation (abgelöst durch `docs/01`–`10`) |

**Einstieg:** [`docs/README.md`](docs/README.md) — dort stehen Dokumentenlandkarte,
Arbeitsweise und die Anleitung zur Aufgabenverwaltung über GitHub Issues.

## Aufgabenverwaltung

Das Backlog wird als GitHub Issues geführt: Actions → **„Backlog nach Issues
synchronisieren“** → Run workflow (mit *apply*) erzeugt Labels, Milestones M1–M6 und alle
Tickets. Details und Regeln: [`docs/README.md`](docs/README.md#aufgabenverwaltung-mit-github).

## Lokale Entwicklung

Voraussetzung: Node.js 22 und npm. Mit `nvm` wird die im Repository hinterlegte
Node-Version über `.nvmrc` ausgewählt.

```sh
git clone https://github.com/dimto13/ai-tutor-lab.git
cd ai-tutor-lab
nvm use
npm ci
npm run dev:local
```

`dev:local` startet den Vite-Entwicklungsserver auf allen lokalen Netzwerk-Interfaces
(`0.0.0.0`). Dadurch funktioniert sowohl der Zugriff auf demselben Rechner als auch — sofern
Firewall und Netzwerk dies erlauben — von einem anderen Rechner im selben Netzwerk.

Nach dem Start zeigt Vite die tatsächlich verwendeten Adressen und den Port an. Verwende
für Zugriffe von einem anderen Rechner die von Vite ausgegebene Netzwerkadresse bzw. die
IP-Adresse des Entwicklungsrechners zusammen mit dem angezeigten Port.

Der Build verwendet die nativen Plugins von TanStack Start, Vite, React, Tailwind CSS und
Nitro. Es besteht keine Abhängigkeit mehr zu der ursprünglichen Prototyping-Umgebung.

Bei späteren Änderungen am aktuellen Branch reicht normalerweise:

```sh
git pull
npm ci
npm run dev:local
```

Vor einem Push können TypeScript und Produktions-Build gemeinsam geprüft werden:

```sh
npm run check
```

Für Backlog-Tooling zusätzlich: `pip install pyyaml requests`.
