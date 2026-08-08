# 07 — Roadmap

Die Roadmap ist bewusst nach **Erkenntnisgewinn** geordnet, nicht nach technischer Bequemlichkeit.
Jeder Meilenstein hat ein Abbruch- bzw. Prüfkriterium: Wenn es nicht erfüllt ist, wird nicht
weitergebaut, sondern korrigiert.

| MS | Titel | Zweck | Umfang | Prüfkriterium |
|---|---|---|---|---|
| **M0** | POC | UX-Grundidee belegen | erledigt (Prototyp) | Ablauf ist nachvollziehbar ✔ |
| **M1** | Refaktorierung zur Training Engine | Generizität strukturell verankern | 23 Tickets / 136 SP | Ein zweites Szenario entsteht ohne Engine-Änderung |
| **M2** | Betreibbares MVP auf AWS | Echte Nutzer, echte Daten | siehe Backlog | 15 Pilotnutzer können unabhängig arbeiten |
| **M3** | Pilot, Nachweise, Compliance | Wirksamkeit und Einführbarkeit belegen | siehe Backlog | Abschlussquote ≥ 80 %, Nachweis exportierbar |
| **M4** | Content-Skalierung, Betrieb & Dokumenten-Check | Inhalte ohne Entwicklerteam; Check in Mandanten-Boundary | siehe Backlog | Autor:in erstellt Szenario in ≤ 2 h; Check besteht Datenflussprüfung |
| **M5** | Enterprise-Funktionen | Mandanten, Zuweisung, Reporting | offen | erste Fremdkundeninstallation |
| **M6** | Echte Runtime | Simulation ergänzen, nicht ersetzen | offen | Challenge-Szenario läuft auf code-server |

## M1 — Refaktorierung (vor jedem AWS-Deployment)

Das ist der wichtigste Meilenstein. Wird er übersprungen, wird der Prototyp zur Altlast.

Reihenfolge:
1. `AITP-80`, `AITP-81` — Prototyp-Code ins eigene Repository, Monorepo, CI
2. `AITP-1`, `AITP-2` — Katalog und Inhaltshierarchie
3. `AITP-20`, `AITP-10`, `AITP-15` — Adapter-Interface, Engine, Events
4. `AITP-11`, `AITP-12`, `AITP-16` — Validierung, Beinahe-Treffer, Weiter-Button entfernen
5. `AITP-40`, `AITP-41`, `AITP-42`, `AITP-43` — Overlay auf semantische Ziele, Hilfe, Panel
6. `AITP-21`, `AITP-22`, `AITP-23` — Simulator realistisch machen
7. `AITP-30`, `AITP-31` — Modi einführen, Explore-Modus
8. `AITP-90`, `AITP-91` — Schema, Migration des Bestandskurses
9. `AITP-50`, `AITP-51` — Tutorkontext, deterministischer Tutor

**Abnahme M1:** Ein neues Szenario lässt sich ausschließlich durch eine YAML-Datei ergänzen.
Nachweisbar per Diff: keine Änderung in `packages/training-engine` und `apps/web`.

## M2 — MVP auf AWS

Erst jetzt Amplify. Schwerpunkt: Auth, Persistenz, Punkte, zweiter Technologie-Adapter,
vollständiges VS-Code-Modul in allen drei Modi.

**Abnahme M2:** Fünfzehn Personen können sich anmelden, ein Modul abschließen, den Browser
schließen und exakt weiterarbeiten.

Zusätzlich in M2/M3: das Lernmodul **Datenklassifizierung** (`AITP-120`–`AITP-122`) — es
braucht nur einen einfachen neuen Adapter und beweist die Generizität ein zweites Mal, mit
einem Thema, das jede Zielfirma sofort versteht.

## M3 — Pilot und Compliance

`AITP-113` (Pilot) ist der eigentliche Zweck dieser Stufe. Alle acht offenen Fragen aus der
POC-Spezifikation werden hier beantwortet — mit Daten, nicht mit Meinung. Parallel:
Sichtbarkeitsstufen, Transparenzseite, Löschkonzept, rechtliche Einordnung der Nachweise.

**Abnahme M3:** Abschlussquote ≥ 80 %, mindestens 60 % bestehen eine Challenge ohne Hinweise,
Nachweis-Export funktioniert, Datenschutzkonzept liegt schriftlich vor.

## M4–M6 — nach dem Pilot planen

Bewusst nicht durchgeplant. Nach M3 wird sich die Priorisierung verschieben — vermutlich
stärker Richtung Content-Menge als Richtung Technik. Das ist zu erwarten und kein Planungsfehler.

## Was bewusst **nicht** früh gebaut wird

| Verschoben | Grund |
|---|---|
| Kubernetes, Nutzer-Pods, PVCs | Löst kein Problem, das der Pilot hat; verzehnfacht Betriebsaufwand |
| Echte GitHub-/M365-APIs | Lizenz-, Berechtigungs- und Proxy-Hürden sind exakt die Probleme, die die Plattform umgehen soll |
| RAG auf Unternehmensrichtlinien | Erst sinnvoll, wenn es echte Kundenrichtlinien gibt |
| Multi-Tenant-Infrastruktur | Erst relevant, wenn die Produktfrage "intern oder Fremdkunden" entschieden ist (ADR-09) |
| Dokumenten-Check mit echten Dokumenten | Braucht dedizierte Mandanten-Boundary, Datenflussprüfung und rechtliche Positionierung — vorher läuft nur das synthetische Lernmodul |
| Lasttests, Autoscaling | Bei simulierter Runtime ist die Last vernachlässigbar |
