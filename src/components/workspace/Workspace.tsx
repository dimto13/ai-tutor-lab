import { useEffect, useRef, useState } from "react";
import {
  Files,
  Search,
  GitBranch,
  Blocks,
  FilePlus2,
  FolderGit2,
  ChevronRight,
  ChevronDown,
  Terminal as TerminalIcon,
  X,
  Sparkles,
  FileCode2,
  FileText,
  Folder,
  Settings,
  AlertCircle,
  ScrollText,
} from "lucide-react";
import { workspaceBus } from "@/state/eventBus";
import { useTraining } from "@/state/trainingStore";
import { vscodeRuntime } from "@/runtime/vscodeRuntime";

type View = "explorer" | "search" | "scm" | "extensions";
type WorkspaceMode = "none" | "folder" | "workspace";
type PanelView = "terminal" | "problems" | "output";

interface FileNode {
  name: string;
  kind: "file" | "folder";
}

const BASE_FILES: FileNode[] = [
  { name: "README.md", kind: "file" },
  { name: "src", kind: "folder" },
  { name: "docs", kind: "folder" },
];

const INITIAL_CONTENT: Record<string, string> = {
  "README.md": "# ai-training-demo\n\nDemo-Repository für das AI Training Lab.\n",
};

const MENU_ITEMS = ["File", "Edit", "Selection", "View", "Go", "Run", "Terminal", "Help"] as const;

export function Workspace() {
  const { mode } = useTraining();
  const [view, setView] = useState<View | null>(null);
  const [repoOpen, setRepoOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("none");
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [treeExpanded, setTreeExpanded] = useState(true);
  const [files, setFiles] = useState<FileNode[]>(BASE_FILES);
  const [contents, setContents] = useState<Record<string, string>>(INITIAL_CONTENT);
  const [tabs, setTabs] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelView>("terminal");
  const [lines, setLines] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [staged, setStaged] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotPrompt, setCopilotPrompt] = useState("");
  const [copilotAnswer, setCopilotAnswer] = useState<string | null>(null);
  const [wrongFile, setWrongFile] = useState<string | null>(null);

  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const newFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (newFileName !== null) newFileRef.current?.focus();
  }, [newFileName]);
  useEffect(() => {
    if (panelOpen && activePanel === "terminal") terminalInputRef.current?.focus();
  }, [panelOpen, activePanel]);
  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight });
  }, [lines]);

  const inspect = (ref: string) => {
    if (mode === "explore") vscodeRuntime.inspect(ref);
  };

  const openView = (next: View, target: string) => {
    inspect(target);
    setView(next);
    if (next === "explorer") workspaceBus.emit("explorer.opened");
  };

  const applyWorkingContext = (nextMode: Exclude<WorkspaceMode, "none">) => {
    const folders =
      nextMode === "folder" ? ["ai-training-demo"] : ["ai-training-demo", "shared-tools"];
    vscodeRuntime.setWorkspace(nextMode, folders);
    setWorkspaceMode(nextMode);
    setRepoOpen(true);
    setView("explorer");
    setFileMenuOpen(false);
    if (nextMode === "folder") {
      workspaceBus.emit("folder.opened", { name: "ai-training-demo", folderCount: 1 });
    } else {
      workspaceBus.emit("workspace.opened", {
        name: "ai-training-lab.code-workspace",
        folders,
        settings: { "editor.formatOnSave": true },
      });
    }
  };

  const openRepo = () => {
    vscodeRuntime.setWorkspace("folder", ["ai-training-demo"]);
    setWorkspaceMode("folder");
    setRepoOpen(true);
    setView("explorer");
    workspaceBus.emit("repository.opened", { name: "ai-training-demo" });
  };

  const openFile = (name: string) => {
    setTabs((t) => (t.includes(name) ? t : [...t, name]));
    setActiveFile(name);
    vscodeRuntime.setActiveFile(name);
  };

  const createFile = (raw: string) => {
    const name = raw.trim();
    setNewFileName(null);
    if (!name) return;
    if (files.some((f) => f.name === name)) return;
    setFiles((f) => [...f, { name, kind: "file" }]);
    setContents((c) => ({ ...c, [name]: "" }));
    vscodeRuntime.addFile(name);
    openFile(name);
    setWrongFile(name === "hello.py" || name === "challenge.py" ? null : name);
    workspaceBus.emit("file.created", { filename: name });
  };

  const updateContent = (value: string) => {
    if (!activeFile) return;
    setContents((c) => ({ ...c, [activeFile]: value }));
    workspaceBus.emit("file.updated", { filename: activeFile, content: value });
  };

  const openPanel = (panel: PanelView) => {
    setPanelOpen(true);
    setActivePanel(panel);
    vscodeRuntime.setActivePanel(panel);
    workspaceBus.emit("panel.opened", { panel });
  };

  const openTerminal = () => {
    openPanel("terminal");
    if (lines.length === 0) {
      setLines(["AI Training Lab – simulierte Shell (bash)", "user@lab:~/ai-training-demo$"]);
    }
    workspaceBus.emit("terminal.opened");
  };

  const runCommand = () => {
    const cmd = command.trim();
    if (!cmd) return;
    setCommand("");
    const out: string[] = [`user@lab:~/ai-training-demo$ ${cmd}`];
    const hasHello = files.some((f) => f.name === "hello.py");

    if (cmd === "git status") {
      out.push(
        "On branch main",
        "Your branch is up to date with 'origin/main'.",
        "",
        staged ? "Changes to be committed:" : "Untracked files:",
        staged
          ? '  (use "git restore --staged <file>..." to unstage)'
          : '  (use "git add <file>..." to include in what will be committed)',
        staged ? "\tnew file:   hello.py" : "\thello.py",
        "",
        staged
          ? ""
          : 'nothing added to commit but untracked files present (use "git add" to track)',
      );
    } else if (/^git add\s+/.test(cmd)) {
      if (cmd.includes("hello.py") || cmd.includes(".")) {
        if (!hasHello) out.push("fatal: pathspec 'hello.py' did not match any files");
        else {
          setStaged(true);
          out.push("");
        }
      } else out.push("fatal: pathspec did not match any files");
    } else if (cmd.startsWith("git commit")) {
      if (!staged) out.push('nothing added to commit (use "git add" to track files)');
      else
        out.push(
          "[main abc123] add hello example",
          " 1 file changed, 1 insertion(+)",
          " create mode 100644 hello.py",
        );
    } else if (cmd === "clear") {
      setLines([]);
      workspaceBus.emit("terminal.command.executed", { command: cmd, staged });
      return;
    } else if (cmd === "ls") {
      out.push(files.map((f) => f.name).join("  "));
    } else {
      out.push(`bash: ${cmd.split(" ")[0]}: command not found`);
    }
    setLines((l) => [...l, ...out]);
    workspaceBus.emit("terminal.command.executed", { command: cmd, staged });
  };

  const submitCopilot = () => {
    const prompt = copilotPrompt.trim();
    if (!prompt) return;
    const answer = "def add(a, b):\n    return a + b";
    setCopilotAnswer(answer);
    if (activeFile) {
      setContents((c) => ({ ...c, [activeFile]: `${c[activeFile] ?? ""}\n\n${answer}\n` }));
    }
    workspaceBus.emit("copilot.prompt.submitted", { prompt });
    setCopilotPrompt("");
  };

  const activityItems: { id: View; icon: typeof Files; label: string; target: string }[] = [
    { id: "explorer", icon: Files, label: "Explorer", target: "vscode.activityBar.explorer" },
    { id: "search", icon: Search, label: "Suche", target: "vscode.activityBar.search" },
    { id: "scm", icon: GitBranch, label: "Source Control", target: "vscode.activityBar.scm" },
    {
      id: "extensions",
      icon: Blocks,
      label: "Extensions",
      target: "vscode.activityBar.extensions",
    },
  ];

  const switchPanel = (panel: PanelView) => {
    inspect(`vscode.panel.${panel}`);
    openPanel(panel);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-editor">
      <div className="relative flex h-8 shrink-0 items-center border-b border-border bg-panel px-2 text-[12px] text-foreground/85">
        {MENU_ITEMS.map((item) => (
          <button
            key={item}
            data-highlight={item === "File" ? "vscode.menu.file" : undefined}
            onClick={() => {
              if (item !== "File") return;
              inspect("vscode.menu.file");
              setFileMenuOpen((open) => !open);
            }}
            className="rounded px-2 py-1 hover:bg-white/10"
          >
            {item}
          </button>
        ))}
        <span className="ml-auto pr-2 text-[11px] text-muted-foreground">
          {workspaceMode === "workspace"
            ? "ai-training-lab (Workspace)"
            : workspaceMode === "folder"
              ? "ai-training-demo"
              : "Visual Studio Code"}
        </span>

        {fileMenuOpen ? (
          <div className="absolute left-2 top-8 z-30 w-72 rounded-md border border-border bg-panel py-1 shadow-2xl">
            <button className="block w-full px-3 py-1.5 text-left hover:bg-white/10">
              New Text File
            </button>
            <button className="block w-full px-3 py-1.5 text-left hover:bg-white/10">
              Open File...
            </button>
            <div className="my-1 border-t border-border" />
            <button
              data-highlight="vscode.menu.file.openFolder"
              onClick={() => {
                inspect("vscode.menu.file.openFolder");
                applyWorkingContext("folder");
              }}
              className="block w-full px-3 py-1.5 text-left hover:bg-white/10"
            >
              Open Folder...
            </button>
            <button
              data-highlight="vscode.menu.file.openWorkspace"
              onClick={() => {
                inspect("vscode.menu.file.openWorkspace");
                applyWorkingContext("workspace");
              }}
              className="block w-full px-3 py-1.5 text-left hover:bg-white/10"
            >
              Open Workspace...
            </button>
            <button className="block w-full px-3 py-1.5 text-left hover:bg-white/10">
              Add Folder to Workspace...
            </button>
            <button className="block w-full px-3 py-1.5 text-left hover:bg-white/10">
              Save Workspace As...
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-activity py-2">
          {activityItems.map(({ id, icon: Icon, label, target }) => (
            <button
              key={id}
              data-highlight={target}
              onClick={() => openView(id, target)}
              title={label}
              aria-label={label}
              className={`flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground ${
                view === id ? "bg-white/5 text-foreground" : ""
              }`}
            >
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>

        <aside
          data-highlight="vscode.sideBar"
          onClickCapture={() => inspect("vscode.sideBar")}
          className="flex w-60 shrink-0 flex-col border-r border-border bg-panel"
        >
          <div className="flex h-9 items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>
              {view === "explorer" || view === null
                ? "Explorer"
                : view === "search"
                  ? "Suche"
                  : view === "scm"
                    ? "Source Control"
                    : "Extensions"}
            </span>
            {repoOpen && (view === "explorer" || view === null) ? (
              <button
                data-highlight="vscode.explorer.newFile"
                onClick={() => {
                  inspect("vscode.explorer.newFile");
                  setNewFileName("");
                }}
                title="Neue Datei"
                aria-label="Neue Datei"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              >
                <FilePlus2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3 text-sm">
            {view === null ? (
              <p className="px-3 py-6 text-xs leading-relaxed text-muted-foreground">
                Kein Bereich geöffnet. Wähle links ein Symbol in der Activity Bar.
              </p>
            ) : view === "search" ? (
              <p className="px-3 py-6 text-xs leading-relaxed text-muted-foreground">
                Volltextsuche über den aktuellen Arbeitskontext.
              </p>
            ) : view === "scm" ? (
              <div className="px-3 py-4 text-xs leading-relaxed text-muted-foreground">
                <p className="mb-2 text-foreground">Änderungen</p>
                {files.some((f) => f.name === "hello.py") ? (
                  <p className="font-mono text-warning">{staged ? "A" : "U"} hello.py</p>
                ) : (
                  <p>Keine Änderungen erkannt.</p>
                )}
              </div>
            ) : view === "extensions" ? (
              <div className="px-3 py-4 text-xs leading-relaxed text-muted-foreground">
                <p className="text-foreground">GitHub Copilot</p>
                <p>Installiert · aktiviert (simuliert)</p>
              </div>
            ) : !repoOpen ? (
              <div className="px-2 py-3">
                <p className="mb-3 px-1 text-xs leading-relaxed text-muted-foreground">
                  Öffne über <span className="text-foreground">File</span> einen Ordner oder einen
                  gespeicherten Workspace.
                </p>
                <p className="mb-2 px-1 text-xs text-muted-foreground">Vorbereitete Repositories</p>
                <button
                  data-highlight="vscode.explorer.preparedRepository"
                  onClick={openRepo}
                  className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2 py-2 text-left text-sm text-foreground transition-colors hover:border-ring hover:bg-white/5"
                >
                  <FolderGit2 className="h-4 w-4 text-accent" />
                  ai-training-demo
                </button>
              </div>
            ) : (
              <div data-highlight="vscode.explorer.tree" className="py-1">
                {workspaceMode === "workspace" ? (
                  <button
                    type="button"
                    data-highlight="vscode.workspace.context"
                    onClick={() => inspect("vscode.workspace.context")}
                    className="mx-2 mb-2 block w-[calc(100%-1rem)] rounded-md border border-border bg-card p-2 text-left text-[11px] leading-relaxed"
                  >
                    <span className="block font-medium text-foreground">
                      ai-training-lab.code-workspace
                    </span>
                    <span className="block text-muted-foreground">2 Ordner im Arbeitskontext</span>
                    <span className="mt-1 flex items-center gap-1 text-muted-foreground">
                      <Settings className="h-3 w-3" /> Workspace-Einstellung: formatOnSave = true
                    </span>
                  </button>
                ) : null}

                <button
                  onClick={() => setTreeExpanded((v) => !v)}
                  className="flex w-full items-center gap-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-foreground"
                >
                  {treeExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  ai-training-demo
                </button>
                {treeExpanded ? (
                  <ul>
                    {files.map((f) => (
                      <li key={f.name}>
                        <button
                          onClick={() => f.kind === "file" && openFile(f.name)}
                          className={`flex w-full items-center gap-2 py-1 pl-6 pr-2 text-left text-[13px] transition-colors hover:bg-white/5 ${
                            activeFile === f.name
                              ? "bg-white/10 text-foreground"
                              : "text-muted-foreground"
                          } ${wrongFile === f.name ? "text-destructive ring-1 ring-destructive/60" : ""}`}
                        >
                          {f.kind === "folder" ? (
                            <Folder className="h-4 w-4 text-accent" />
                          ) : f.name.endsWith(".py") ? (
                            <FileCode2 className="h-4 w-4 text-accent" />
                          ) : (
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          )}
                          {f.name}
                        </button>
                      </li>
                    ))}
                    {newFileName !== null ? (
                      <li className="py-1 pl-6 pr-2">
                        <input
                          ref={newFileRef}
                          value={newFileName}
                          onChange={(e) => setNewFileName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") createFile(newFileName);
                            if (e.key === "Escape") setNewFileName(null);
                          }}
                          placeholder="dateiname.py"
                          className="w-full rounded border border-ring bg-editor px-1.5 py-1 font-mono text-[13px] text-foreground outline-none"
                        />
                      </li>
                    ) : null}
                  </ul>
                ) : null}

                {workspaceMode === "workspace" ? (
                  <div className="mt-1 flex items-center gap-2 px-5 py-1 text-[13px] text-muted-foreground">
                    <Folder className="h-4 w-4 text-accent" /> shared-tools
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 items-stretch border-b border-border bg-panel">
            {tabs.length === 0 ? (
              <span className="flex items-center px-3 text-xs text-muted-foreground">
                Keine Datei geöffnet
              </span>
            ) : (
              tabs.map((t) => (
                <div
                  key={t}
                  className={`flex items-center gap-2 border-r border-border px-3 text-[13px] ${
                    activeFile === t ? "bg-editor text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <button onClick={() => openFile(t)}>{t}</button>
                  <button
                    aria-label={`${t} schließen`}
                    onClick={() => {
                      setTabs((tt) => tt.filter((x) => x !== t));
                      if (activeFile === t) {
                        setActiveFile(null);
                        vscodeRuntime.setActiveFile(null);
                      }
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
            <div className="ml-auto flex items-center pr-2">
              <button
                data-highlight="vscode.editor.copilot"
                onClick={() => setCopilotOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-foreground transition-colors hover:border-ring hover:bg-white/5"
              >
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                Copilot fragen
              </button>
            </div>
          </div>

          {copilotOpen ? (
            <div className="border-b border-border bg-panel px-3 py-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-accent" />
                <input
                  value={copilotPrompt}
                  onChange={(e) => setCopilotPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitCopilot()}
                  placeholder="Create a Python function that adds two numbers."
                  className="flex-1 rounded border border-border bg-editor px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-ring"
                />
              </div>
              {copilotAnswer ? (
                <div className="mt-2 rounded-md border border-border bg-editor p-2">
                  <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                    Copilot Vorschlag · übernommen
                  </p>
                  <pre className="font-mono text-[12px] leading-relaxed text-success">
                    {copilotAnswer}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}

          <div
            data-highlight="vscode.editor"
            onClickCapture={() => inspect("vscode.editor")}
            className="relative min-h-0 flex-1"
          >
            {activeFile ? (
              <div className="flex h-full">
                <div className="select-none border-r border-border bg-editor px-3 py-3 text-right font-mono text-[12px] leading-6 text-muted-foreground">
                  {(contents[activeFile] ?? "").split("\n").map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <textarea
                  value={contents[activeFile] ?? ""}
                  onChange={(e) => updateContent(e.target.value)}
                  spellCheck={false}
                  className="h-full flex-1 resize-none bg-editor px-3 py-3 font-mono text-[13px] leading-6 text-foreground outline-none"
                  placeholder='print("Hello AI Training")'
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Öffne eine Datei im Explorer, um sie zu bearbeiten.
              </div>
            )}
          </div>

          {panelOpen ? (
            <div className="h-52 shrink-0 border-t border-border bg-terminal">
              <div className="flex h-8 items-center justify-between border-b border-border px-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                <div className="flex h-full items-center gap-4">
                  {(["terminal", "problems", "output"] as const).map((panel) => (
                    <button
                      key={panel}
                      data-highlight={`vscode.panel.${panel}`}
                      onClick={() => switchPanel(panel)}
                      className={`h-full border-b py-2 ${
                        activePanel === panel
                          ? "border-foreground text-foreground"
                          : "border-transparent hover:text-foreground"
                      }`}
                    >
                      {panel === "terminal"
                        ? "Terminal"
                        : panel === "problems"
                          ? "Problems"
                          : "Output"}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setPanelOpen(false)}
                  aria-label="Panel schließen"
                  className="hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {activePanel === "terminal" ? (
                <div
                  ref={terminalRef}
                  className="h-[calc(13rem-2rem)] overflow-y-auto px-3 py-2 font-mono text-[12.5px] leading-6"
                >
                  {lines.map((l, i) => (
                    <div key={i} className="whitespace-pre-wrap text-foreground/85">
                      {l}
                    </div>
                  ))}
                  <div
                    className="flex items-center gap-2"
                    data-highlight="vscode.panel.terminal.input"
                  >
                    <span className="text-success">user@lab:~/ai-training-demo$</span>
                    <input
                      ref={terminalInputRef}
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && runCommand()}
                      spellCheck={false}
                      aria-label="Terminal-Eingabe"
                      className="flex-1 bg-transparent font-mono text-[12.5px] text-foreground outline-none"
                    />
                  </div>
                </div>
              ) : activePanel === "problems" ? (
                <div className="flex h-[calc(13rem-2rem)] items-start gap-2 px-4 py-4 text-[13px] text-muted-foreground">
                  <AlertCircle className="mt-0.5 h-4 w-4 text-success" />
                  <div>
                    <p className="text-foreground">
                      No problems have been detected in the workspace.
                    </p>
                    <p className="mt-1">
                      Diagnosen von Sprachservern, Lintern und Compilern erscheinen hier.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-[calc(13rem-2rem)] overflow-y-auto px-4 py-4 text-[13px] text-muted-foreground">
                  <div className="flex items-center gap-2 text-foreground">
                    <ScrollText className="h-4 w-4" /> Output · VS Code
                  </div>
                  <p className="mt-2 font-mono text-[12px]">
                    [info] Workspace services initialized.
                  </p>
                  <p className="font-mono text-[12px]">[info] Extension host ready.</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div
        data-highlight="vscode.statusBar"
        onClickCapture={() => inspect("vscode.statusBar")}
        className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-statusbar px-3 text-[11px] text-foreground/80"
      >
        <span className="flex items-center gap-1">
          <GitBranch className="h-3.5 w-3.5" /> main
        </span>
        <span>
          {workspaceMode === "workspace"
            ? "Workspace · 2 Ordner"
            : repoOpen
              ? "Ordner · ai-training-demo"
              : "kein Arbeitskontext"}
        </span>
        <span className="text-muted-foreground">
          {activeFile ? `${activeFile} · Python` : "Python 3.12"}
        </span>
        <button
          data-highlight="vscode.statusBar.terminal"
          onClick={openTerminal}
          className="ml-auto flex items-center gap-1.5 rounded px-2 py-0.5 transition-colors hover:bg-white/10"
        >
          <TerminalIcon className="h-3.5 w-3.5" /> Terminal
        </button>
      </div>
    </div>
  );
}
