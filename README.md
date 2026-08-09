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

| Bereich                                                         | Inhalt                                                                                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [GitHub Issues](https://github.com/dimto13/ai-tutor-lab/issues) | **Aufgabenverwaltung** — alle Tickets, Epics als Sub-Issue-Struktur                                                                          |
| [`docs/`](docs/README.md)                                       | **Produkt- und Anforderungsdokumentation** — Vision, Domänenmodell, Architektur, Anforderungen, Gamification, Roadmap, offene Entscheidungen |
| [`prompts/model-briefing.md`](prompts/model-briefing.md)        | Kontext-Briefing für jede LLM-Sitzung an diesem Projekt                                                                                      |
| `src/`                                                          | POC-Quellcode (React/TypeScript/Vite) — wird gemäß Meilenstein M1 refaktoriert                                                               |
| [`backlog/`](backlog/README.md)                                 | Archiv des ursprünglichen Planungsstands (nicht mehr gepflegt)                                                                               |
| [`docs/archiv/`](docs/archiv/poc-spezifikation.md)              | Ursprüngliche POC-Spezifikation (abgelöst durch `docs/01`–`10`)                                                                              |

**Einstieg:** [`docs/README.md`](docs/README.md) — dort stehen Dokumentenlandkarte,
Arbeitsweise und die Anleitung zur Aufgabenverwaltung über GitHub Issues.

## Aufgabenverwaltung

Aufgaben werden ausschließlich als [GitHub Issues](https://github.com/dimto13/ai-tutor-lab/issues)
geführt und im [Project „AI Tutor – Development“](https://github.com/users/dimto13/projects/3)
verfolgt. Ein neues Issue bekommt beim Anlegen Epic-Label, Prio-Label, Typ-Label und
Milestone und wird als Sub-Issue unter das passende Epic gehängt. Details und Regeln:
[`docs/README.md`](docs/README.md#aufgabenverwaltung-mit-github).

## Beitragen

Keine direkten Pushes auf `main` — Änderungen laufen über einen eigenen Branch und einen
Pull Request.

## Lokale Entwicklung

Voraussetzung: Node.js 22 und npm. Mit `nvm` wird die im Repository hinterlegte
Node-Version über `.nvmrc` ausgewählt.

```sh
git clone https://github.com/dimto13/ai-tutor-lab.git
cd ai-tutor-lab
nvm use
npm ci --install-strategy=nested
npm run dev:local
```

`dev:local` startet den Vite-Entwicklungsserver auf allen lokalen Netzwerk-Interfaces
(`0.0.0.0`). Dadurch funktioniert sowohl der Zugriff auf demselben Rechner als auch — sofern
Firewall und Netzwerk dies erlauben — von einem anderen Rechner im selben Netzwerk.

Nach dem Start zeigt Vite die tatsächlich verwendeten Adressen und den Port an. Verwende
für Zugriffe von einem anderen Rechner die von Vite ausgegebene Netzwerkadresse bzw. die
IP-Adresse des Entwicklungsrechners zusammen mit dem angezeigten Port.

Der Build verwendet die nativen Plugins von TanStack Start, Vite, React, Tailwind CSS und
Nitro. Es besteht keine Build-Abhängigkeit mehr zur ursprünglichen Prototyping-Umgebung.

Bei späteren Änderungen am aktuellen Branch reicht normalerweise:

```sh
git pull
npm ci --install-strategy=nested
npm run dev:local
```

Vor einem Push können Content, Linting, TypeScript und Produktions-Build gemeinsam geprüft werden:

```sh
npm run check
```
