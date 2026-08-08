# Archiv — ursprüngliche POC-Spezifikation

> Historisches Dokument. Diese Spezifikation war die Grundlage des ersten Prototyps
> (Stand vor Version 1.0 des Anforderungspakets). Sie ist durch `docs/01`–`docs/10`
> abgelöst und wird hier nur zur Nachvollziehbarkeit aufbewahrt. Der vollständige
> Wortlaut liegt in der Git-Historie der Repo-README (Commits vor dem 2026-08-08).

## Kernpunkte der ursprünglichen Spezifikation

**Ziel:** Browserbasierter Proof of Concept einer interaktiven KI-Schulungsplattform.
Mitarbeiter ohne technische Vorkenntnisse werden Schritt für Schritt durch typische
KI- und Entwickler-Workflows geführt. Bewusst keine Enterprise-Plattform — Fokus auf
User Experience, Trainingsablauf, visuelle Führung und Zusammenspiel von Lernschritten,
Arbeitsumgebung und KI-Tutor. Spätere Zielarchitektur (Kubernetes, code-server,
GitHub Copilot, CLI-Agenten, Enterprise-SSO) wird simuliert.

**Layout:** Zweispaltig — links (~70 %) eine VS-Code-artige simulierte Arbeitsumgebung
(Activity Bar, Explorer, Editor-Tabs, Terminal, Statusleiste), rechts (~30 %) das
Training-Guide-Panel mit aktuellem Schritt, Aufgabe, Hinweisen und Tutor-Chat.

**Szenario (8 Schritte):** Explorer kennenlernen → Repository öffnen → Datei `hello.py`
erstellen → Code schreiben → Terminal öffnen → `git status` → `git add` + `git commit`
→ Copilot-Simulation (Additionsfunktion generieren).

**Mechaniken:**
- Overlay-/Highlight-System: Kontext abdunkeln, Zielelement hervorheben, Tooltip,
  Element bleibt klickbar
- State Machine: NOT_STARTED / ACTIVE / COMPLETED (optional VALIDATION_FAILED),
  genau ein Schritt aktiv, Persistenz in LocalStorage
- Event-System: `explorer.opened`, `file.created`, `terminal.command.executed` usw.;
  Fortschritt durch echte Nutzeraktionen, nicht durch Weiter-Buttons
- KI-Tutor: zunächst simuliert, kennt Szenario, Schritt, abgeschlossene Schritte und
  letzte Aktion
- Fehlerverhalten: falscher Dateiname (`test.py` statt `hello.py`) führt zu
  unterstützender Korrekturmeldung
- Dreistufiges Hilfesystem: Hinweis → konkrete Anweisung → visuelle Hervorhebung
- Abschlussbildschirm mit Dauer, Hinweisen, Fehlversuchen; Dashboard mit drei
  Trainingskarten (Git/VS Code/Copilot funktional, CLI-Agenten und M365 als Vorschau)

**UX-Vorgaben:** Professionell, Enterprise-tauglich, keine verspielte Gamification.
Orientierung an GitHub, VS Code, Microsoft Learn, modernen SaaS-Dashboards. Der Nutzer
versteht jederzeit: Wo bin ich? Was soll ich tun? Warum? War meine Aktion erfolgreich?
Was kommt als Nächstes?

**Technik:** React, TypeScript, Tailwind CSS; zentrale Scenario-Definition statt in
Komponenten verteilter Daten; strikte Trennung Training Logic / Workspace UI über ein
Event-System, vorbereitet auf spätere Runtime-Adapter (VS Code, Terminal, M365).

**Explizit ausgeschlossen im POC:** Kubernetes, Docker, echte Pods/PVs, SSO, echte
GitHub-/Copilot-/M365-Anbindung, RAG, Multi-Tenant-Backend, Autoscaling.

**Bewertungsfragen nach Fertigstellung:** Intuitivität des Ablaufs, Zusammenspiel
Workspace/Guide-Panel, Nutzen der Highlights, Platzbedarf und Sichtbarkeit des Tutors,
Wirkung der automatischen Schrittvalidierung, Verhältnis Anleitung vs. eigenständiges
Ausprobieren.
