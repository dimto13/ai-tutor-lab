# AI Training Lab

Interaktive KI-Schulungsplattform für Unternehmen: Mitarbeitende ohne technische
Vorkenntnisse lernen in einer geführten Browser-Umgebung, Werkzeuge zu bedienen **und**
KI produktiv darin einzusetzen — simulierte Arbeitsumgebung, automatische
Schrittvalidierung, kontextbewusster Tutor.

**Live-POC:** https://ai-guide-trainer.lovable.app

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

Voraussetzung: Node.js und npm — [Installation über nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd ai-tutor-lab
npm i
npm run dev
```

Für Backlog-Tooling zusätzlich: `pip install pyyaml requests`.
