# 15 — Anfänger-Pflichtpfad und Advanced-Konzepte

Für Szenarien mit `personaId: "non-programmer"` gilt: Der Pflichtpfad enthält nur Bedienhandlungen und Konzepte, die für das aktuelle Lernziel unmittelbar nötig sind.

## Grundregel

Ein fortgeschrittenes Konzept darf im Anfängerpfad erklärt oder im Explore-Modus angeboten werden, aber nicht als Pflichtaktion erscheinen, wenn das Lernziel auch ohne diese Konfiguration erreicht werden kann.

Beispiele:

- **Workspace:** Anfänger verstehen den Unterschied zwischen `Open Folder` und einem gespeicherten Workspace. Einen Multi-Root-Workspace mit mehreren Ordnern und Workspace-Einstellungen müssen sie im VS-Code-Grundkurs nicht konfigurieren.
- **Terminal:** Das Terminal als Bereich darf erklärt und geöffnet werden. Spezielle Shell-Flags, komplexe Kommandozeilen oder fortgeschrittene Terminalkonfiguration gehören nur in ein Modul, dessen Lernziel genau das erfordert.
- **Inline-Vervollständigung:** Sie darf in einem Copilot-Modul praktisch verwendet werden, wenn sie dort erklärt wird. Sie ist keine Voraussetzung für allgemeine VS-Code-Grundlagen.
- **Erweiterte Editor-/Debug-Funktionen:** Multi-Cursor, Debug-Konfiguration, komplexe Editor-Layouts oder ähnliche Funktionen bleiben Explore-/Advanced-Inhalte, solange sie nicht explizites Lernziel sind.

## Entscheidung für Autoren

Vor jedem Aktionsschritt ist zu prüfen:

1. Ist diese Handlung für das Lernziel zwingend erforderlich?
2. Wurde das dafür nötige Konzept bereits erklärt?
3. Kann derselbe Lernzweck mit einer einfacheren Handlung erreicht werden?
4. Ist der Schritt nur deshalb enthalten, weil das echte Produkt diese Funktion ebenfalls besitzt?

Wenn Frage 1 mit Nein oder Frage 3 mit Ja beantwortet wird, gehört die Handlung nicht in den Anfänger-Pflichtpfad. Sie kann stattdessen als Erklärung, Explore-Ziel oder späteres Advanced-Szenario erhalten bleiben.

## VS-Code-Grundlagen

Der verpflichtende Guided-Pfad verwendet `Open Folder` als einfachsten Arbeitskontext. Der Workspace-Begriff wird dabei erklärt. `Open Workspace from File...` bleibt im Explore-Modus verfügbar, damit interessierte Nutzer den Unterschied praktisch untersuchen können, ohne dass Multi-Root-Konfiguration zur Einstiegshürde wird.
