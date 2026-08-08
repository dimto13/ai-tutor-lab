import type { Scenario } from "@/types/training";

const str = (v: unknown) => (typeof v === "string" ? v : "");

export const gitBasicsScenario: Scenario = {
  id: "git-basics",
  title: "Git, VS Code & GitHub Copilot – Grundlagen",
  description:
    "Lerne die Arbeitsumgebung kennen: Dateien verwalten, Code schreiben, Terminal nutzen, Änderungen versionieren und Copilot einsetzen.",
  steps: [
    {
      id: "step_1",
      title: "Explorer kennenlernen",
      description:
        "Der Explorer ist deine Dateiübersicht. Hier siehst du alle Ordner und Dateien deines Projekts.",
      instruction: "Öffne den Explorer in der Leiste links.",
      why: "Ohne Dateiübersicht weißt du nicht, woran du arbeitest. Der Explorer ist der Startpunkt jeder Aufgabe in der Entwicklungsumgebung.",
      helpLevels: [
        "Der Explorer befindet sich links in der Activity Bar.",
        "Klicke auf das oberste Datei-Symbol in der schmalen Leiste am linken Rand.",
        "Das Ziel-Element wird jetzt deutlich hervorgehoben – klicke darauf.",
      ],
      expectedEvent: "explorer.opened",
      highlightTarget: "activity-explorer",
      highlightTooltip: "Hier findest du die Dateien und Ordner deines Projekts.",
      successMessage: "Explorer geöffnet. Du siehst jetzt deine Projektübersicht.",
    },
    {
      id: "step_2",
      title: "Repository öffnen",
      description:
        "Ein Repository ist ein versionierter Projektordner. Für dieses Training ist eines vorbereitet.",
      instruction: 'Öffne das vorbereitete Repository "ai-training-demo".',
      why: "Alle Arbeitsdateien und deren Historie liegen im Repository. Erst nach dem Öffnen kann Git Änderungen erkennen.",
      helpLevels: [
        "Im Explorer wird ein vorbereitetes Repository angeboten.",
        'Klicke im Explorer auf den Eintrag "ai-training-demo".',
        "Das Repository im Explorer wird hervorgehoben – klicke darauf.",
      ],
      expectedEvent: "repository.opened",
      highlightTarget: "repo-item",
      highlightTooltip: 'Klicke hier, um das Repository "ai-training-demo" zu öffnen.',
      successMessage: "Repository geöffnet. Der Dateibaum ist jetzt sichtbar.",
      validate: (p) => {
        const name = str(p['name']);
        return name === "ai-training-demo"
          ? { ok: true }
          : { ok: false, message: `Für diese Übung benötigen wir das Repository "ai-training-demo".` };
      },
    },
    {
      id: "step_3",
      title: "Datei erstellen",
      description: "Neue Dateien legst du direkt im Explorer an.",
      instruction: "Erstelle im Projektverzeichnis eine neue Datei hello.py.",
      why: "Code lebt in Dateien. Die Dateiendung .py signalisiert, dass es sich um Python-Code handelt.",
      helpLevels: [
        "Im Explorer-Kopf gibt es eine Aktion zum Anlegen neuer Dateien.",
        'Klicke auf das "Neue Datei"-Symbol, tippe hello.py und drücke Enter.',
        "Der Button zum Anlegen einer Datei wird hervorgehoben – klicke darauf.",
      ],
      expectedEvent: "file.created",
      highlightTarget: "new-file-btn",
      highlightTooltip: "Neue Datei anlegen – Name eingeben und Enter drücken.",
      successMessage: "hello.py wurde erstellt und im Editor geöffnet.",
      validate: (p) => {
        const filename = str(p['filename']);
        return filename === "hello.py"
          ? { ok: true }
          : {
              ok: false,
              message: `Fast richtig. Für diese Übung benötigen wir eine Datei mit dem Namen hello.py (erstellt: ${filename}).`,
            };
      },
    },
    {
      id: "step_4",
      title: "Code schreiben",
      description: "Der Editor in der Mitte ist dein Schreibbereich.",
      instruction: 'Schreibe print("Hello AI Training") in die Datei hello.py.',
      why: "print gibt Text aus – der klassische erste Test, ob dein Code läuft.",
      helpLevels: [
        "Klicke in den Editor und tippe die Zeile ab.",
        'Schreibe genau: print("Hello AI Training")',
        "Der Editorbereich wird hervorgehoben – schreibe dort deinen Code.",
      ],
      expectedEvent: "file.updated",
      highlightTarget: "editor-area",
      highlightTooltip: "Hier schreibst du deinen Code.",
      successMessage: "Code erkannt. Deine Datei enthält den erwarteten Inhalt.",
      validate: (p) => {
        const filename = str(p['filename']);
        const content = str(p['content']).toLowerCase().replace(/[“”]/g, '"');
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
      id: "step_5",
      title: "Terminal öffnen",
      description:
        "Das integrierte Terminal führt Befehle aus – zum Beispiel Git-Kommandos.",
      instruction: "Öffne das integrierte Terminal.",
      why: "Viele Entwickler-Werkzeuge werden über Textbefehle gesteuert. Das Terminal ist dafür der Ort.",
      helpLevels: [
        "Das Terminal öffnest du über die Statusleiste unten oder den Terminal-Button.",
        'Klicke auf den Button "Terminal" unten rechts in der Statusleiste.',
        "Der Terminal-Button wird hervorgehoben – klicke darauf.",
      ],
      expectedEvent: "terminal.opened",
      highlightTarget: "terminal-btn",
      highlightTooltip: "Öffnet das integrierte Terminal am unteren Rand.",
      successMessage: "Terminal geöffnet.",
    },
    {
      id: "step_6",
      title: "Git Status prüfen",
      description:
        "git status zeigt, welche Änderungen Git in deinem Projekt erkannt hat.",
      instruction: "Führe im Terminal git status aus.",
      why: "Vor jedem Commit prüfst du den Status: Welche Dateien sind neu, geändert oder vorgemerkt?",
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
        const cmd = str(p['command']).trim();
        return cmd === "git status"
          ? { ok: true }
          : { ok: false, message: `Für diesen Schritt wird genau der Befehl git status benötigt.` };
      },
    },
    {
      id: "step_7",
      title: "Git Commit erstellen",
      description:
        "Mit git add merkst du Änderungen vor, mit git commit speicherst du sie in der Historie.",
      instruction: 'Führe git add hello.py und danach git commit -m "add hello example" aus.',
      why: "Ein Commit ist ein nachvollziehbarer Speicherpunkt mit Beschreibung – die Grundlage für Zusammenarbeit.",
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
        const cmd = str(p['command']).trim();
        const staged = p['staged'] === true;
        if (cmd.startsWith("git commit")) {
          if (!staged)
            return {
              ok: false,
              message:
                "Der Commit braucht vorgemerkte Änderungen. Führe zuerst git add hello.py aus.",
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
      id: "step_8",
      title: "GitHub Copilot verwenden",
      description:
        "Copilot erzeugt Code aus einer Beschreibung in natürlicher Sprache.",
      instruction:
        'Bitte Copilot, eine Python-Funktion zum Addieren zweier Zahlen zu erstellen, z. B.: "Create a Python function that adds two numbers."',
      why: "KI-Assistenz beschleunigt Routinecode. Du beschreibst das Ziel, prüfst danach das Ergebnis.",
      helpLevels: [
        "Im Editor gibt es eine Copilot-Eingabe.",
        'Klicke auf "Copilot fragen", tippe deine Anfrage und drücke Enter.',
        "Der Copilot-Button wird hervorgehoben – klicke darauf.",
      ],
      expectedEvent: "copilot.prompt.submitted",
      highlightTarget: "copilot-btn",
      highlightTooltip: "Copilot in natürlicher Sprache um Code bitten.",
      successMessage: "Copilot hat eine Funktion vorgeschlagen und in deine Datei eingefügt.",
      validate: (p) => {
        const prompt = str(p['prompt']).toLowerCase();
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
