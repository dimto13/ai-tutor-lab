# AI Training Lab — Produkt- und Anforderungsdokumentation

> Einstiegspunkt der Dokumentation. Der Anwendungs-Quellcode liegt unter `apps/web/src/`,
> die wiederverwendbaren Bausteine unter `packages/` und die alte POC-Spezifikation im
> [Archiv](archiv/poc-spezifikation.md).

Konsolidierte Arbeitsgrundlage für die Weiterentwicklung der interaktiven KI-Schulungsplattform
vom POC zur produktreifen Plattform.

**Stand:** 2026-08-11 · **Version:** 1.3 · **Status:** Arbeitsgrundlage, noch nicht abgenommen

---

## Ausgangslage

| Artefakt          | Inhalt                                                                                              | Status                                   |
| ----------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Ursprungskonzept  | Enterprise-Zielarchitektur (K8s, FastAPI, code-server, RAG-Tutor)                                   | vorhanden                                |
| POC-Spezifikation | 8-Schritt-Szenario "Git, VS Code & Copilot", simulierte Umgebung                                    | umgesetzt                                |
| Live-POC          | Prototyp-Deployment (URL intern dokumentiert)                                                       | lauffähig                                |
| POC-Review        | Kritik: zu eng auf VS Code/Git/Copilot zugeschnitten, fehlende Trennung von Lerninhalt und Werkzeug | eingearbeitet                            |
| Neu               | Punktesystem / Motivationsmechanik                                                                  | in `05-gamification.md` spezifiziert     |
| Neu               | Datenklassifizierung & Dokumenten-Check                                                             | in `10-dokumenten-check.md` spezifiziert |
| Neu               | Cloud-neutrale Anwendungsgrenze mit AWS als erster Infrastrukturimplementierung                     | in `20-cloud-provider-boundary.md`       |

## Dokumentenlandkarte

| Datei                                | Zweck                                                                                           | Zielgruppe               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------ |
| `01-vision-und-scope.md`             | Warum, für wen, was gehört dazu — und was nicht                                                 | alle                     |
| `02-domaenenmodell.md`               | Fachliches Modell, Entitäten, TypeScript-Contracts                                              | Entwicklung, LLM-Agenten |
| `03-architektur.md`                  | Schichtenmodell, Runtime-Adapter, Event-Bus, Deployment-Stufen                                  | Entwicklung              |
| `04-anforderungen.md`                | Nummerierte funktionale/nicht-funktionale Anforderungen (FR/NFR)                                | Product, QA              |
| `05-gamification.md`                 | Punkte-, Kompetenz- und Nachweissystem                                                          | Product, Compliance      |
| `06-backlog.md`                      | Ursprünglicher Planungsstand — **Archiv**, siehe [`../backlog/README.md`](../backlog/README.md) | Historie                 |
| `07-roadmap.md`                      | Meilensteine M0–M6, Reihenfolge, Abbruchkriterien                                               | Steuerung                |
| `08-offene-entscheidungen.md`        | ADRs, Risiken, offene Fragen an dich                                                            | Entscheider              |
| `09-glossar.md`                      | Begriffe, damit Modelle konsistent bleiben                                                      | alle                     |
| `10-dokumenten-check.md`             | Datenklassifizierung: Lernmodul + Prüfwerkzeug in Mandanten-Boundary                            | Product, Security        |
| `12-simulator-aktualitaet.md`        | Halbjährliche Produktprüfung, Verantwortlichkeit und automatische Drift-Tickets                 | Product, QA, Entwicklung |
| `18-monorepo-architektur.md`         | Workspace-Struktur, Package-Grenzen, Training Engine und Deployment-Basis                       | Entwicklung              |
| `19-aws-amplify-konventionen.md`     | Verbindliche AWS-Amplify-, Build-, Release- und Gen-2-Regeln                                    | Entwicklung, LLM-Agenten |
| `20-cloud-provider-boundary.md`      | Cloud-neutrale Ports/Adapter-Grenze; AWS heute, weitere Provider später                         | Entwicklung, LLM-Agenten |
| `../prompts/model-briefing.md`       | Kompakter Kontext-Prompt für beliebige LLMs                                                     | dich, LLM-Agenten        |
| `../prompts/prototyp-iteration-2.md` | Umbau-Auftrag für das Prototyping-Werkzeug                                                      | dich                     |

Die **aktuelle** Aufgabenlage steht nicht in einer Datei, sondern in den
[GitHub Issues](https://github.com/dimto13/ai-tutor-lab/issues).

## Aufgabenverwaltung mit GitHub

Aufgaben werden **ausschließlich als GitHub Issues** geführt. Es gibt keine Backlog-Datei
mehr, die parallel gepflegt werden müsste, und keinen Sync-Mechanismus — der Issue-Text ist
die Quelle.

| Konzept            | GitHub-Entsprechung                                                                    |
| ------------------ | -------------------------------------------------------------------------------------- |
| Ticket             | Issue, Titelpräfix `AITP-x:` bei fortgeführten Tickets aus der Erstplanung             |
| Epic               | Eigenes Issue mit Label `type: epic`; zugehörige Tickets sind **Sub-Issues** davon     |
| Zuordnung zum Epic | zusätzlich Label `epic: EP-xx` (für Filter und Board-Gruppierung)                      |
| Priorität          | Label `prio: must/should/could`                                                        |
| Typ                | Label `type: story/task/chore/spike`                                                   |
| Meilenstein M1–M6  | GitHub Milestone                                                                       |
| Akzeptanzkriterien | Checkboxen im Issue-Body                                                               |
| Board/Tracking     | [GitHub Project „AI Tutor – Development“](https://github.com/users/dimto13/projects/3) |

**Ein neues Issue anlegen:**

1. Titel knapp und ergebnisorientiert formulieren.
2. Body: kurze Beschreibung, darunter `### Akzeptanzkriterien` als Checkbox-Liste, darunter
   Schätzung, betroffene Anforderungen (`FR-xx`/`NFR-xx`) und Abhängigkeiten als
   Issue-Referenzen (`#97`).
3. Labels setzen: `epic: EP-xx`, `prio: …`, `type: …`.
4. Milestone zuweisen.
5. Als Sub-Issue unter das passende Epic hängen.

**Board:** Das [Project „AI Tutor – Development“](https://github.com/users/dimto13/projects/3)
ist mit dem Repository verknüpft. Sein Auto-add-Workflow nimmt neue Issues auf; die
Statusspalten sind `Backlog / Bereit / In Arbeit / Review / Fertig`. Die vorbereiteten
Ansichten `Meilensteine` und `Epics` müssen im Web-UI einmalig über **Group by** auf
`Milestone` beziehungsweise `Labels` gestellt werden, da die öffentliche Project-API diese
View-Eigenschaft nicht schreiben kann.

**Regeln:**

1. Inhaltliche Änderungen an einem Ticket → direkt im Issue-Text. Es gibt keine
   vorgelagerte Datei mehr.
2. Statusarbeit (zuweisen, Board-Spalte, Checkboxen abhaken, schließen) → ebenfalls im Issue.
3. `backlog/` und `docs/06-backlog.md` sind eingefrorenes Archiv des Planungsstands vom
   2026-08-08 und werden nicht mehr aktualisiert.
4. Codeänderungen laufen über einen eigenen Branch und einen Pull Request; direkte Pushes
   auf `main` sind gesperrt. Der PR referenziert das Issue (`Closes #123`).

## Arbeitsweise

1. **Aufgaben leben in den Issues**, nicht in Dateien. Wer eine Aufgabe ändert, ändert das Issue.
2. **Anforderungen bekommen IDs** (`FR-xx`, `NFR-xx`). Issues referenzieren diese IDs.
   Dadurch bleibt nachvollziehbar, welche Anforderung wo umgesetzt wird.
3. **Beim Arbeiten mit einem neuen Modell** zuerst `../prompts/model-briefing.md` +
   `02-domaenenmodell.md` einspielen. Bei Cloud-, Auth-, Persistenz-, Amplify- oder Deployment-Arbeit
   zusätzlich `19-aws-amplify-konventionen.md` und `20-cloud-provider-boundary.md`. Dadurch bleibt
   insbesondere die Abhängigkeitsrichtung `Anwendung -> eigener Port <- Cloud-Adapter` verbindlich.
4. **Alles in ein Git-Repository.** Diese Doku gehört neben den Code, nicht in ein separates Wiki.

## Empfohlene Repository-Struktur

```
ai-training-platform/
  docs/                  ← dieses Paket
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
  amplify/               ← aktuelle AWS-spezifische Infrastruktur; keine fachliche API
```

Begründung für das Monorepo: Die Trainingsengine muss unabhängig vom Frontend testbar sein,
Szenarien müssen ohne Frontend-Build validierbar sein, und Cloud-Infrastruktur darf nicht in die
fachlichen Pakete oder UI-Komponenten einsickern.
