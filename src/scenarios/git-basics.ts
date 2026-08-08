import type { Scenario } from "@/types/training";

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Transitional POC workflow scenario. It assumes basic IDE concepts and focuses
 * on using VS Code, Git and GitHub Copilot together. Tool-specific explanations
 * live in their own modules.
 */
export const gitBasicsScenario: Scenario = {
  id: "git-basics",
  title: "VS Code, Git & GitHub Copilot – Zusammenspiel",
  description:
    "Wende die Werkzeuge gemeinsam in einem typischen Entwicklungsablauf an: Projekt öffnen, Datei bearbeiten, Änderungen mit Git versionieren und Copilot einsetzen.",
  steps: [
    {
      id: "step_1",
      title: "Explorer öffnen",
      description: "Für den Workflow brauchst du Zugriff auf die Projektdateien im Explorer.",
      instruction: "Öffne den Explorer in der Leiste links.",
      why: "Der kombinierte Workflow startet im vorhandenen Projektkontext. Die Oberfläche selbst wird im separaten VS-Code-Grundkurs erklärt.",
      helpLevels: [
        "Der Explorer befindet sich links in der Activity Bar.",
        "Klicke auf das oberste Datei-Symbol in der schmalen Leiste am linken Rand.",
        "Das Explorer-Symbol wird jetzt deutlich hervorgehoben – klicke darauf.",
      ],
      expectedEvent: "explorer.opened",
      highlightTarget: "activity-explorer",
      highlightTooltip: "Öffne den Explorer für den Projektworkflow.",
      successMessage: "Explorer geöffnet. Jetzt kannst du mit dem vorbereiteten Projekt arbeiten.",
    },
    {
      id: "step_2",
      title: "Repository öffnen",
      description:
        "Für den gemeinsamen Workflow ist ein versioniertes Beispielprojekt vorbereitet.",
      instruction: 'Öffne das vorbereitete Repository "ai-training-demo".',
      why: "Git arbeitet mit einem Repository. In diesem Kurs steht nicht die VS-Code-Oberfläche im Mittelpunkt, sondern der Ablauf über mehrere Werkzeuge hinweg.",
      helpLevels: [
        "Im Explorer wird ein vorbereitetes Repository angeboten.",
        'Klicke im Explorer auf den Eintrag "ai-training-demo".',
        "Das Repository im Explorer wird hervorgehoben – klicke darauf.",
      ],
      expectedEvent: "repository.opened",
      highlightTarget: "repo-item",
      highlightTooltip: 'Öffne das vorbereitete Repository "ai-training-demo".',
      successMessage: "Repository geöffnet. Der gemeinsame Arbeitskontext ist bereit.",
      validate: (p) => {
        const name = str(p["name"]);
        return name === "ai-training-demo"
          ? { ok: true }
          : {
              ok: false,
              message: 'Für diese Übung benötigen wir das Repository "ai-training-demo".',
            };
      },
    },
    {
      id: "step_3",
      title: "Datei erstellen",
      description: "Erstelle eine neue Datei im vorbereiteten Projekt.",
      instruction: "Erstelle im Projektverzeichnis eine neue Datei hello.py.",
      why: "Die Datei liefert eine konkrete Änderung, die anschließend im Editor bearbeitet und mit Git versioniert wird.",
      helpLevels: [
        "Im Explorer-Kopf gibt es eine Aktion zum Anlegen neuer Dateien.",
        'Klicke auf das "Neue Datei"-Symbol, tippe hello.py und drücke Enter.',
        "Der Button zum Anlegen einer Datei wird hervorgehoben – klicke darauf.",
      ],
      expectedEvent: "file.created",
      highlightTarget: "new-file-btn",
      highlightTooltip: "Neue Datei im Projekt anlegen.",
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
      id: "step_4",
      title: "Code schreiben",
      description: "Bearbeite die neue Datei im Editor.",
      instruction: 'Schreibe print("Hello AI Training") in die Datei hello.py.',
      why: "Die Änderung wird im nächsten Schritt von Git erkannt. Damit siehst du den Übergang vom Editor zur Versionsverwaltung.",
      helpLevels: [
        "Klicke in den Editor und tippe die Zeile ab.",
        'Schreibe genau: print("Hello AI Training")',
        "Der Editorbereich wird hervorgehoben – schreibe dort deinen Code.",
      ],
      expectedEvent: "file.updated",
      highlightTarget: "editor-area",
      highlightTooltip: "Bearbeite die Datei, bevor du die Änderung mit Git prüfst.",
      successMessage: "Datei geändert. Jetzt kann Git den neuen Stand erkennen.",
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
      id: "step_5",
      title: "Terminal öffnen",
      description: "Wechsle für die Git-Befehle in das integrierte Terminal.",
      instruction: "Öffne das integrierte Terminal.",
      why: "Der Workflow verbindet Editor und Kommandozeile innerhalb desselben Projektkontexts.",
      helpLevels: [
        "Das Terminal öffnest du über den Terminal-Button.",
        'Klicke auf den Button "Terminal" unten rechts.',
        "Der Terminal-Button wird hervorgehoben – klicke darauf.",
      ],
      expectedEvent: "terminal.opened",
      highlightTarget: "terminal-btn",
      highlightTooltip: "Öffne das Terminal für die Git-Befehle.",
      successMessage: "Terminal geöffnet. Jetzt kannst du den Repository-Status prüfen.",
    },
    {
      id: "step_6",
      title: "Git Status prüfen",
      description: "Prüfe, welche Änderung Git im Repository erkannt hat.",
      instruction: "Führe im Terminal git status aus.",
      why: "Vor einem Commit kontrollierst du, welche Dateien neu, geändert oder vorgemerkt sind.",
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
      id: "step_7",
      title: "Git Commit erstellen",
      description: "Nimm die Änderung in die Versionshistorie auf: erst vormerken, dann committen.",
      instruction: 'Führe git add hello.py und danach git commit -m "add hello example" aus.',
      why: "Der Commit macht aus der Editoränderung einen nachvollziehbaren Stand im Repository.",
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
              message:
                "Der Commit braucht vorgemerkte Änderungen. Führe zuerst git add hello.py aus.",
            };
          return /-m\s+["“'].+["”']/.test(cmd)
            ? { ok: true }
            : {
                ok: false,
                message: 'Bitte mit Commit-Nachricht: git commit -m "add hello example"',
              };
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
      title: "GitHub Copilot einsetzen",
      description: "Ergänze den bestehenden Workflow jetzt um KI-Unterstützung im Editor.",
      instruction:
        'Bitte Copilot, eine Python-Funktion zum Addieren zweier Zahlen zu erstellen, z. B.: "Create a Python function that adds two numbers."',
      why: "Copilot ergänzt den bestehenden Entwicklungsworkflow. Du beschreibst das Ziel, prüfst den Vorschlag und arbeitest weiterhin im selben Projektkontext.",
      helpLevels: [
        "Im Editor gibt es eine Copilot-Eingabe.",
        'Klicke auf "Copilot fragen", tippe deine Anfrage und drücke Enter.',
        "Der Copilot-Button wird hervorgehoben – klicke darauf.",
      ],
      expectedEvent: "copilot.prompt.submitted",
      highlightTarget: "copilot-btn",
      highlightTooltip:
        "Copilot als zusätzliche KI-Unterstützung im bestehenden Workflow verwenden.",
      successMessage:
        "Copilot hat einen Vorschlag erzeugt. Du hast VS Code, Git und Copilot in einem Ablauf verwendet.",
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
