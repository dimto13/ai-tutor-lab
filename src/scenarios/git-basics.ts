import type { Scenario } from "@/types/training";

const str = (v: unknown) => (typeof v === "string" ? v : "");

export const gitBasicsScenario: Scenario = {
  id: "git-basics",
  title: "VS Code, Git & GitHub Copilot – Grundlagen",
  description:
    "Lerne zuerst die Arbeitsumgebung und ihre Konzepte kennen. Danach verwaltest du Dateien, nutzt das Terminal, versionierst Änderungen und setzt Copilot ein.",
  steps: [
    {
      id: "step_1",
      title: "Explorer kennenlernen",
      description:
        "Der Explorer ist die Dateiübersicht von VS Code. Er ist Teil der Side Bar; das Explorer-Symbol selbst sitzt in der schmalen Activity Bar ganz links.",
      instruction: "Öffne den Explorer in der Activity Bar.",
      why: "VS Code trennt Navigation und Inhalt: Die Activity Bar wählt einen Arbeitsbereich wie Explorer oder Suche aus, die Side Bar zeigt anschließend dessen Inhalt.",
      helpLevels: [
        "Der Explorer befindet sich links in der Activity Bar.",
        "Klicke auf das oberste Datei-Symbol in der schmalen Leiste am linken Rand.",
        "Das Explorer-Symbol wird jetzt deutlich hervorgehoben – klicke darauf.",
      ],
      expectedEvent: "explorer.opened",
      highlightTarget: "activity-explorer",
      highlightTooltip: "Explorer: zeigt Dateien und Ordner des aktuellen Arbeitskontexts.",
      successMessage: "Explorer geöffnet. Activity Bar und Side Bar haben unterschiedliche Aufgaben.",
    },
    {
      id: "step_2",
      title: "Einen Ordner als Arbeitskontext öffnen",
      description:
        "Mit Open Folder öffnest du einen einzelnen Ordner. VS Code behandelt ihn als deinen aktuellen Single-Folder-Arbeitskontext. Explorer, Suche, Terminal und Git beziehen sich dann auf diesen Ordner.",
      instruction: 'Öffne über File → Open Folder... den vorbereiteten Ordner "ai-training-demo".',
      why: "Ein Ordner ist der einfachste Arbeitskontext in VS Code. Das ist etwas anderes als nur eine einzelne Datei zu öffnen: VS Code kennt dadurch die gesamte Projektstruktur.",
      helpLevels: [
        "Nutze die Menüleiste oben im simulierten VS Code.",
        'Klicke auf File und anschließend auf "Open Folder...".',
        "Das File-Menü wird hervorgehoben. Öffne es und wähle Open Folder... .",
      ],
      expectedEvent: "folder.opened",
      highlightTarget: "vscode-menu-file",
      highlightTooltip: "File enthält Befehle zum Öffnen von Dateien, Ordnern und Workspaces.",
      successMessage: "Ordner geöffnet. VS Code arbeitet jetzt mit genau einem Projektordner.",
      validate: (p) => {
        const name = str(p["name"]);
        return name === "ai-training-demo"
          ? { ok: true }
          : { ok: false, message: 'Öffne für diese Übung den Ordner "ai-training-demo".' };
      },
    },
    {
      id: "step_3",
      title: "Ordner und Workspace unterscheiden",
      description:
        "Ein gespeicherter VS-Code-Workspace kann mehrere Ordner zu einem Arbeitskontext zusammenfassen und eigene Einstellungen speichern. Das ist nützlich, wenn eine Aufgabe aus mehreren zusammengehörigen Projekten besteht.",
      instruction: "Öffne jetzt über File → Open Workspace... den vorbereiteten Workspace.",
      why: "Der Unterschied ist konzeptionell wichtig: Open Folder arbeitet mit einem Ordner. Eine .code-workspace-Datei beschreibt dagegen einen Arbeitskontext, der mehrere Ordner und Workspace-spezifische Einstellungen enthalten kann.",
      helpLevels: [
        "Öffne erneut das File-Menü.",
        'Wähle "Open Workspace...". Danach siehst du zwei Ordner und eine Workspace-Einstellung.',
        "Das File-Menü wird hervorgehoben. Öffne dort den gespeicherten Workspace.",
      ],
      expectedEvent: "workspace.opened",
      highlightTarget: "vscode-menu-file",
      highlightTooltip: "Ein Workspace kann mehrere Ordner und eigene Einstellungen zusammenfassen.",
      successMessage: "Workspace geöffnet. Im Explorer siehst du jetzt einen Mehrordner-Kontext und eine Workspace-Einstellung.",
      validate: (p) => {
        const folders = Array.isArray(p["folders"]) ? p["folders"] : [];
        return folders.length >= 2
          ? { ok: true }
          : { ok: false, message: "Ein Workspace soll hier mindestens zwei Ordner enthalten." };
      },
    },
    {
      id: "step_4",
      title: "Datei erstellen",
      description: "Neue Dateien legst du direkt im Explorer innerhalb eines geöffneten Ordners an.",
      instruction: "Erstelle im Projektordner ai-training-demo eine neue Datei hello.py.",
      why: "Der Explorer zeigt nicht nur Struktur, sondern ist auch ein zentraler Einstiegspunkt für Dateioperationen. Die Endung .py kennzeichnet Python-Code.",
      helpLevels: [
        "Im Explorer-Kopf gibt es eine Aktion zum Anlegen neuer Dateien.",
        'Klicke auf das "Neue Datei"-Symbol, tippe hello.py und drücke Enter.',
        "Der Button zum Anlegen einer Datei wird hervorgehoben – klicke darauf.",
      ],
      expectedEvent: "file.created",
      highlightTarget: "new-file-btn",
      highlightTooltip: "Neue Datei im aktuellen Projektordner anlegen.",
      successMessage: "hello.py wurde erstellt und im Editor geöffnet.",
      validate: (p) => {
        const filename = str(p["filename"]);
        return filename === "hello.py"
          ? { ok: true }
          : {
              ok: false,
              message: `Fast richtig. Für diese Übung benötigen wir eine Datei mit dem Namen hello.py (erstellt: ${filename}).`,
            };
      },
    },
    {
      id: "step_5",
      title: "Editor verwenden",
      description:
        "Der Editor ist der große Arbeitsbereich in der Mitte. Geöffnete Dateien erscheinen oben als Tabs und werden darunter bearbeitet.",
      instruction: 'Schreibe print("Hello AI Training") in die Datei hello.py.',
      why: "Explorer und Editor haben getrennte Rollen: Im Explorer navigierst du, im Editor bearbeitest du den Inhalt der ausgewählten Datei.",
      helpLevels: [
        "Klicke in den Editor und tippe die Zeile ab.",
        'Schreibe genau: print("Hello AI Training")',
        "Der Editorbereich wird hervorgehoben – schreibe dort deinen Code.",
      ],
      expectedEvent: "file.updated",
      highlightTarget: "editor-area",
      highlightTooltip: "Editor: Inhalt der aktuell geöffneten Datei bearbeiten.",
      successMessage: "Code erkannt. Explorer und Editor erfüllen unterschiedliche Aufgaben.",
      validate: (p) => {
        const filename = str(p["filename"]);
        const content = str(p["content"]).toLowerCase().replace(/[“”]/g, '"');
        if (filename !== "hello.py")
          return { ok: false, message: "Bitte schreibe den Code in die Datei hello.py." };
        const ok = content.includes("print(") && content.includes("hello ai training");
        if (ok) return { ok: true };
        if (content.trim().length < 8) return { ok: false };
        return {
          ok: false,
          message: 'Noch nicht ganz. Erwartet wird eine Zeile wie print("Hello AI Training").',
        };
      },
    },
    {
      id: "step_6",
      title: "Panel und Terminal öffnen",
      description:
        "Unterhalb des Editors besitzt VS Code ein Panel. Dort liegen unter anderem Terminal, Problems und Output. Das Terminal ist also nicht die gesamte untere Fläche, sondern ein Tab dieses Panels.",
      instruction: "Öffne das integrierte Terminal.",
      why: "Viele Entwickler-Werkzeuge werden über Textbefehle gesteuert. Das integrierte Terminal arbeitet im Kontext deines geöffneten Projekts, ohne dass du VS Code verlassen musst.",
      helpLevels: [
        "Das Terminal öffnest du über den Terminal-Button unten rechts.",
        'Klicke auf den Button "Terminal" in der Statusleiste.',
        "Der Terminal-Button wird hervorgehoben – klicke darauf.",
      ],
      expectedEvent: "terminal.opened",
      highlightTarget: "terminal-btn",
      highlightTooltip: "Öffnet den Terminal-Tab im unteren Panel.",
      successMessage: "Panel geöffnet. Terminal, Problems und Output sind dort als getrennte Bereiche angeordnet.",
    },
    {
      id: "step_7",
      title: "Git Status prüfen",
      description:
        "git status zeigt, welche Änderungen Git in deinem Projekt erkannt hat. Git arbeitet mit dem Repository, das innerhalb deines geöffneten Arbeitskontexts liegt.",
      instruction: "Führe im Terminal git status aus.",
      why: "Vor einem Commit prüfst du den Status: Welche Dateien sind neu, geändert oder bereits vorgemerkt?",
      helpLevels: [
        "Tippe den Befehl in das Terminal und drücke Enter.",
        "Schreibe genau: git status",
        "Die Terminal-Eingabezeile wird hervorgehoben – tippe dort git status.",
      ],
      expectedEvent: "terminal.command.executed",
      highlightTarget: "terminal-input",
      highlightTooltip: "Befehle eingeben und mit Enter ausführen.",
      successMessage: "Git erkennt hello.py als neue, noch nicht versionierte Datei.",
      validate: (p) => {
        const cmd = str(p["command"]).trim();
        return cmd === "git status"
          ? { ok: true }
          : { ok: false, message: "Für diesen Schritt wird genau der Befehl git status benötigt." };
      },
    },
    {
      id: "step_8",
      title: "Git Commit erstellen",
      description:
        "Mit git add merkst du Änderungen vor, mit git commit speicherst du sie als nachvollziehbaren Stand in der Repository-Historie.",
      instruction: 'Führe git add hello.py und danach git commit -m "add hello example" aus.',
      why: "Ein Commit ist ein nachvollziehbarer Speicherpunkt mit Beschreibung – die Grundlage für Zusammenarbeit und Versionshistorie.",
      helpLevels: [
        "Zwei Befehle, in dieser Reihenfolge: erst vormerken, dann committen.",
        'Tippe: git add hello.py — dann: git commit -m "add hello example"',
        "Die Terminal-Eingabezeile wird hervorgehoben – gib dort beide Befehle ein.",
      ],
      expectedEvent: "terminal.command.executed",
      highlightTarget: "terminal-input",
      highlightTooltip: "Erst git add, dann git commit.",
      successMessage: "Commit erstellt. Deine Änderung ist jetzt in der Git-Historie.",
      validate: (p) => {
        const cmd = str(p["command"]).trim();
        const staged = p["staged"] === true;
        if (cmd.startsWith("git commit")) {
          if (!staged)
            return {
              ok: false,
              message: "Der Commit braucht vorgemerkte Änderungen. Führe zuerst git add hello.py aus.",
            };
          return /-m\s+["“'].+["”']/.test(cmd)
            ? { ok: true }
            : { ok: false, message: 'Bitte mit Commit-Nachricht: git commit -m "add hello example"' };
        }
        if (cmd.startsWith("git add")) return { ok: false };
        return {
          ok: false,
          message: 'Erwartet werden git add hello.py und git commit -m "add hello example".',
        };
      },
    },
    {
      id: "step_9",
      title: "GitHub Copilot verwenden",
      description:
        "Copilot ist eine zusätzliche Fähigkeit innerhalb der Entwicklungsumgebung. Er ersetzt die IDE nicht, sondern ergänzt deinen bestehenden Arbeitskontext um KI-Unterstützung.",
      instruction:
        'Bitte Copilot, eine Python-Funktion zum Addieren zweier Zahlen zu erstellen, z. B.: "Create a Python function that adds two numbers."',
      why: "KI-Assistenz beschleunigt Routinecode. Entscheidend ist, dass du weißt, in welcher Datei und welchem Projektkontext der Vorschlag landet und das Ergebnis anschließend prüfst.",
      helpLevels: [
        "Im Editor gibt es eine Copilot-Eingabe.",
        'Klicke auf "Copilot fragen", tippe deine Anfrage und drücke Enter.',
        "Der Copilot-Button wird hervorgehoben – klicke darauf.",
      ],
      expectedEvent: "copilot.prompt.submitted",
      highlightTarget: "copilot-btn",
      highlightTooltip: "Copilot in natürlicher Sprache um Code bitten.",
      successMessage: "Copilot hat eine Funktion vorgeschlagen und in deine aktuell geöffnete Datei eingefügt.",
      validate: (p) => {
        const prompt = str(p["prompt"]).toLowerCase();
        const ok = /add|addier|sum|plus/.test(prompt) && prompt.length > 8;
        return ok
          ? { ok: true }
          : {
              ok: false,
              message:
                'Beschreibe die gewünschte Funktion etwas genauer, z. B. "Create a Python function that adds two numbers."',
            };
      },
    },
  ],
};
