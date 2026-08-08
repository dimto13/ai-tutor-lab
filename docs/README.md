# AI Training Lab — Produkt- und Anforderungsdokumentation

> Einstiegspunkt der Dokumentation. Der Anwendungs-Quellcode liegt im Repository-Root
> (`src/`), die alte POC-Spezifikation im [Archiv](archiv/poc-spezifikation.md).

Konsolidierte Arbeitsgrundlage für die Weiterentwicklung der interaktiven KI-Schulungsplattform
vom POC zur produktreifen Plattform.

**Stand:** 2026-08-08 · **Version:** 1.1 · **Status:** Arbeitsgrundlage, noch nicht abgenommen

---

## Ausgangslage

| Artefakt | Inhalt | Status |
|---|---|---|
| Ursprungskonzept | Enterprise-Zielarchitektur (K8s, FastAPI, code-server, RAG-Tutor) | vorhanden |
| POC-Spezifikation | 8-Schritt-Szenario "Git, VS Code & Copilot", simulierte Umgebung | umgesetzt |
| Live-POC | Prototyp-Deployment (URL intern dokumentiert) | lauffähig |
| POC-Review | Kritik: zu eng auf VS Code/Git/Copilot zugeschnitten, fehlende Trennung von Lerninhalt und Werkzeug | eingearbeitet |
| Neu | Punktesystem / Motivationsmechanik | in `05-gamification.md` spezifiziert |
| Neu | Datenklassifizierung & Dokumenten-Check | in `10-dokumenten-check.md` spezifiziert |

## Dokumentenlandkarte

| Datei | Zweck | Zielgruppe |
|---|---|---|
| `01-vision-und-scope.md` | Warum, für wen, was gehört dazu — und was nicht | alle |
| `02-domaenenmodell.md` | Fachliches Modell, Entitäten, TypeScript-Contracts | Entwicklung, LLM-Agenten |
| `03-architektur.md` | Schichtenmodell, Runtime-Adapter, Event-Bus, Deployment-Stufen | Entwicklung |
| `04-anforderungen.md` | Nummerierte funktionale/nicht-funktionale Anforderungen (FR/NFR) | Product, QA |
| `05-gamification.md` | Punkte-, Kompetenz- und Nachweissystem | Product, Compliance |
| `06-backlog.md` | Epics und Tickets mit Akzeptanzkriterien (generiert) | Umsetzung |
| `07-roadmap.md` | Meilensteine M0–M6, Reihenfolge, Abbruchkriterien | Steuerung |
| `08-offene-entscheidungen.md` | ADRs, Risiken, offene Fragen an dich | Entscheider |
| `09-glossar.md` | Begriffe, damit Modelle konsistent bleiben | alle |
| `10-dokumenten-check.md` | Datenklassifizierung: Lernmodul + Prüfwerkzeug in Mandanten-Boundary | Product, Security |
| `../prompts/model-briefing.md` | Kompakter Kontext-Prompt für beliebige LLMs | dich |
| `../prompts/prototyp-iteration-2.md` | Umbau-Auftrag für das Prototyping-Werkzeug | dich |
| `../backlog/backlog.yaml` | **Single Source of Truth** für alle Tickets | Tooling |
| `../backlog/tickets.csv` | Import-Datei für Jira / Linear / Azure DevOps (CI-generiert) | Tooling |

## Aufgabenverwaltung mit GitHub

Das Backlog wird direkt in GitHub verwaltet — ohne separates Ticketsystem:

| Backlog-Konzept | GitHub-Entsprechung |
|---|---|
| Ticket `AITP-x` | Issue mit Titelpräfix `AITP-x:` |
| Epic `EP-xx` | Label `epic: EP-xx` |
| Priorität M/S/C | Label `prio: must/should/could` |
| Typ story/task/chore/spike | Label `type: …` |
| Meilenstein M1–M6 | GitHub Milestone |
| Akzeptanzkriterien | Checkboxen im Issue-Body |
| Board/Tracking | GitHub Projects (manuell anlegen, s. u.) |

**Erstbefüllung und spätere Synchronisation:**

```bash
export GITHUB_TOKEN=<PAT mit Scope repo>
python3 scripts/sync_github.py           # Dry Run — zeigt nur, was passieren würde
python3 scripts/sync_github.py --apply   # legt Labels, Milestones und 71 Issues an
```

Alternativ ohne lokales Setup: GitHub → **Actions → "Backlog nach Issues synchronisieren"
→ Run workflow** (Haken bei *apply* setzen). Der Sync ist idempotent — erneutes Ausführen
aktualisiert bestehende Issues, statt Duplikate zu erzeugen, und lässt geschlossene Issues
geschlossen.

**Board einrichten (einmalig, im Web-UI):** GitHub → Projects → *New project* → Vorlage
*Board*. Alle offenen Issues des Repos hinzufügen, Spalten `Backlog / Bereit / In Arbeit /
Review / Fertig`, dazu die Ansichten *Gruppieren nach Milestone* und *Gruppieren nach
Label epic*. GitHub Projects lässt sich per API nur umständlich vorkonfigurieren — diese
fünf Minuten Handarbeit sind der pragmatische Weg.

**Regeln:**
1. Inhaltliche Änderungen an geplanten Tickets → `../backlog/backlog.yaml`, dann
   `generate_backlog.py` + `sync_github.py --apply`. Nie den Issue-Text als Quelle behandeln.
2. Statusarbeit (zuweisen, Board-Spalte, Checkboxen abhaken, schließen) → direkt im Issue.
3. Spontane Aufgaben außerhalb des Plans → Issue-Template "Aufgabe", ohne `AITP-`-Präfix.
4. Die CI (`backlog.yml`) regeneriert `06-backlog.md` und `tickets.csv` bei jeder Änderung am YAML automatisch.

## Arbeitsweise

1. **Nur `../backlog/backlog.yaml` bearbeiten.** `06-backlog.md` und `backlog/tickets.csv`
   werden von der CI automatisch generiert und committet (lokal: `python3 scripts/generate_backlog.py`).
2. **Anforderungen bekommen IDs** (`FR-xx`, `NFR-xx`). Tickets referenzieren diese IDs.
   Dadurch bleibt nachvollziehbar, welche Anforderung wo umgesetzt wird.
3. **Beim Arbeiten mit einem neuen Modell** zuerst `../prompts/model-briefing.md` +
   `02-domaenenmodell.md` einspielen. Das reicht für die meisten Aufgaben und verhindert,
   dass jedes Modell eine eigene Begriffswelt erfindet.
4. **Alles in ein Git-Repository.** Diese Doku gehört neben den Code, nicht in ein separates Wiki.

## Empfohlene Repository-Struktur

```
ai-training-platform/
  docs/                  ← dieses Paket
  backlog/
  apps/
    web/                 ← React/TS/Tailwind Frontend
  packages/
    training-engine/     ← State Machine, Validierung, Events (frameworkfrei)
    runtime-core/        ← RuntimeAdapter-Interface, Event-Typen
    runtime-vscode-sim/  ← VS-Code-Simulator
    runtime-terminal-sim/
    catalog/             ← Technology/Provider/Product-Katalog
  content/
    scenarios/           ← YAML/JSON-Szenarien, schema-validiert
```

Begründung für das Monorepo: Die Trainingsengine muss unabhängig vom Frontend testbar sein,
und Szenarien müssen ohne Frontend-Build validierbar sein.
