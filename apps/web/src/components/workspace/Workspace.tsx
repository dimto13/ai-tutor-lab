import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Blocks,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FilePlus2,
  FileText,
  Files,
  Folder,
  FolderGit2,
  GitBranch,
  ScrollText,
  Search,
  Settings,
  X,
} from "lucide-react";
import { CopilotPanel } from "./CopilotPanel";
import { ArtifactPreviewPanel } from "./ArtifactPreviewPanel";
import { VscodeMenuBar } from "./VscodeMenuBar";
import { artifactPreviewRuntime } from "@/runtime/artifactPreviewRuntime";
import { copilotRuntime } from "@/runtime/copilotRuntime";
import { vscodeRuntime } from "@/runtime/vscodeRuntime";
import { workspaceBus } from "@/state/eventBus";
import { useTraining } from "@/state/trainingStore";

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

function toFileNodes(runtimeFiles: string[]): FileNode[] {
  const baseNames = new Set(BASE_FILES.map((node) => node.name));
  return [
    ...BASE_FILES.filter((node) => node.kind === "folder" || runtimeFiles.includes(node.name)),
    ...runtimeFiles
      .filter((name) => !baseNames.has(name))
      .map((name): FileNode => ({ name, kind: "file" })),
  ];
}

export function Workspace() {
  const { mode, scenario } = useTraining();
  const runtimeSeed = scenario.environment?.seed;
  const copilotIntegrated =
    scenario.environment?.integrationRuntimeAdapterIds?.includes(copilotRuntime.id) ?? false;
  const artifactPreviewIntegrated =
    scenario.environment?.integrationRuntimeAdapterIds?.includes(artifactPreviewRuntime.id) ??
    false;

  const [view, setView] = useState<View | null>(null);
  const [repoOpen, setRepoOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("none");
  const [treeExpanded, setTreeExpanded] = useState(true);
  const [files, setFiles] = useState<FileNode[]>(BASE_FILES);
  const [contents, setContents] = useState<Record<string, string>>(INITIAL_CONTENT);
  const [tabs, setTabs] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [dirtyFiles, setDirtyFiles] = useState<string[]>([]);
  const [branch, setBranch] = useState("main");
  const [newFileName, setNewFileName] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelView>("terminal");
  const [lines, setLines] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [terminalPrompt, setTerminalPrompt] = useState("user@lab:~/ai-training-demo$");
  const [staged, setStaged] = useState(false);
  const [wrongFile, setWrongFile] = useState<string | null>(null);
  const [copilotChatOpen, setCopilotChatOpen] = useState(false);

  const runtimeRootRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const newFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const container = runtimeRootRef.current;
    if (!container) return;

    const unsubscribe = vscodeRuntime.subscribeState((runtimeState, reason) => {
      setDirtyFiles([...runtimeState.dirtyFiles]);
      setBranch(runtimeState.branch);
      if (reason !== "mount" && reason !== "restore" && reason !== "reset") return;

      setWorkspaceMode(runtimeState.workspaceMode);
      setRepoOpen(runtimeState.workspaceMode !== "none");
      setView(runtimeState.workspaceMode === "none" ? null : "explorer");
      setFiles(toFileNodes(runtimeState.files));
      setContents({ ...runtimeState.contents });
      setTabs([...runtimeState.openTabs]);
      setActiveFile(runtimeState.activeFile);
      setPanelOpen(runtimeState.activePanel !== null);
      if (runtimeState.activePanel) setActivePanel(runtimeState.activePanel);
      setLines([...runtimeState.terminalLines]);
      setCommand(runtimeState.terminalCommand);
      setTerminalPrompt(vscodeRuntime.getTerminalPrompt());
      setStaged(runtimeState.staged);
      setWrongFile(runtimeState.wrongFile);
      setNewFileName(null);
    });

    void vscodeRuntime.mount(container, runtimeSeed);
    return () => {
      unsubscribe();
      void vscodeRuntime.unmount();
    };
  }, [runtimeSeed]);

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
    setTerminalPrompt(vscodeRuntime.getTerminalPrompt());
    setWorkspaceMode(nextMode);
    setRepoOpen(true);
    setView("explorer");
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
    setTerminalPrompt(vscodeRuntime.getTerminalPrompt());
    setWorkspaceMode("folder");
    setRepoOpen(true);
    setView("explorer");
    workspaceBus.emit("repository.opened", { name: "ai-training-demo" });
  };

  const openFile = (name: string) => {
    setTabs((current) => (current.includes(name) ? current : [...current, name]));
    setActiveFile(name);
    vscodeRuntime.setActiveFile(name);
  };

  const createFile = (raw: string) => {
    const name = raw.trim();
    setNewFileName(null);
    if (!name || files.some((file) => file.name === name)) return;

    setFiles((current) => [...current, { name, kind: "file" }]);
    setContents((current) => ({ ...current, [name]: "" }));
    vscodeRuntime.addFile(name);
    vscodeRuntime.saveFile(name);
    openFile(name);
    const acceptedTrainingFiles = new Set(["hello.py", "notiz.txt", "challenge.txt"]);
    const nextWrongFile = acceptedTrainingFiles.has(name) ? null : name;
    setWrongFile(nextWrongFile);
    vscodeRuntime.setWrongFile(nextWrongFile);
    workspaceBus.emit("file.created", { filename: name });
  };

  const updateContent = (value: string) => {
    if (!activeFile) return;
    setContents((current) => ({ ...current, [activeFile]: value }));
    vscodeRuntime.setFileContent(activeFile, value);
    workspaceBus.emit("file.updated", { filename: activeFile, content: value });
  };

  const applyCopilotSuggestion = (text: string) => {
    if (!activeFile) return;
    const nextContent = `${contents[activeFile] ?? ""}${text}`;
    setContents((current) => ({ ...current, [activeFile]: nextContent }));
    vscodeRuntime.setFileContent(activeFile, nextContent);
    workspaceBus.emit("file.updated", { filename: activeFile, content: nextContent });
  };

  const openPanel = (panel: PanelView) => {
    setPanelOpen(true);
    setActivePanel(panel);
    vscodeRuntime.setActivePanel(panel);
    workspaceBus.emit("panel.opened", { panel });
  };

  const openTerminal = () => {
    openPanel("terminal");
    setLines(vscodeRuntime.initializeTerminal());
    setTerminalPrompt(vscodeRuntime.getTerminalPrompt());
    workspaceBus.emit("terminal.opened");
  };

  const runCommand = () => {
    const cmd = command.trim();
    if (!cmd) return;
    const result = vscodeRuntime.executeTerminalCommand(cmd);
    setCommand("");
    setLines(result.lines);
    setTerminalPrompt(result.prompt);
    setStaged(result.staged);
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
    <div
      ref={runtimeRootRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-editor"
    >
      <div className="relative flex h-8 min-w-0 shrink-0 items-center border-b border-border bg-panel px-1 text-[12px] text-foreground/85 sm:px-2">
        <div className="min-w-0 flex-1">
          <VscodeMenuBar
            inspect={inspect}
            openWorkingContext={applyWorkingContext}
            openView={openView}
            openPanel={openPanel}
            openTerminal={openTerminal}
          />
        </div>
        <span className="hidden shrink-0 pr-2 text-[11px] text-muted-foreground lg:inline">
          {workspaceMode === "workspace"
            ? "ai-training-lab (Workspace)"
            : workspaceMode === "folder"
              ? "ai-training-demo"
              : "Visual Studio Code"}
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-border bg-activity py-2 sm:w-12">
          {activityItems.map(({ id, icon: Icon, label, target }) => (
            <button
              key={id}
              data-highlight={target}
              onClick={() => openView(id, target)}
              title={label}
              aria-label={label}
              className={`flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground sm:h-10 sm:w-10 ${
                view === id ? "bg-white/5 text-foreground" : ""
              }`}
            >
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>

        <aside
          data-highlight="vscode.primarySideBar"
          onClickCapture={() => inspect("vscode.primarySideBar")}
          className="flex w-28 shrink-0 flex-col border-r border-border bg-panel sm:w-44 md:w-60"
          aria-label="Primary Side Bar"
        >
          <div data-highlight="vscode.sideBar" className="flex min-h-0 flex-1 flex-col">
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
                  {files.some((file) => file.name === "hello.py") ? (
                    <p className="font-mono text-warning">{staged ? "A" : "U"} hello.py</p>
                  ) : (
                    <p>Keine Änderungen erkannt.</p>
                  )}
                </div>
              ) : view === "extensions" ? (
                <div className="px-3 py-4 text-xs leading-relaxed text-muted-foreground">
                  <p className="text-foreground">GitHub Copilot</p>
                  <p>
                    {copilotIntegrated ? "Installiert · aktiviert (simuliert)" : "Nicht aktiviert"}
                  </p>
                </div>
              ) : !repoOpen ? (
                <div className="px-2 py-3">
                  <p className="mb-3 px-1 text-xs leading-relaxed text-muted-foreground">
                    Öffne über <span className="text-foreground">File</span> einen Ordner oder einen
                    gespeicherten Workspace.
                  </p>
                  <p className="mb-2 px-1 text-xs text-muted-foreground">
                    Vorbereitete Repositories
                  </p>
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
                      <span className="block text-muted-foreground">
                        2 Ordner im Arbeitskontext
                      </span>
                      <span className="mt-1 flex items-center gap-1 text-muted-foreground">
                        <Settings className="h-3 w-3" /> Workspace-Einstellung: formatOnSave = true
                      </span>
                    </button>
                  ) : null}

                  <button
                    onClick={() => setTreeExpanded((expanded) => !expanded)}
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
                      {files.map((file) => (
                        <li key={file.name}>
                          <button
                            onClick={() => file.kind === "file" && openFile(file.name)}
                            className={`flex w-full items-center gap-2 py-1 pl-6 pr-2 text-left text-[13px] transition-colors hover:bg-white/5 ${
                              activeFile === file.name
                                ? "bg-white/10 text-foreground"
                                : "text-muted-foreground"
                            } ${wrongFile === file.name ? "text-destructive ring-1 ring-destructive/60" : ""}`}
                          >
                            {file.kind === "folder" ? (
                              <Folder className="h-4 w-4 text-accent" />
                            ) : file.name.endsWith(".py") ? (
                              <FileCode2 className="h-4 w-4 text-accent" />
                            ) : (
                              <FileText className="h-4 w-4 text-muted-foreground" />
                            )}
                            {file.name}
                          </button>
                        </li>
                      ))}
                      {newFileName !== null ? (
                        <li className="py-1 pl-6 pr-2">
                          <input
                            ref={newFileRef}
                            value={newFileName}
                            onChange={(event) => setNewFileName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") createFile(newFileName);
                              if (event.key === "Escape") setNewFileName(null);
                            }}
                            placeholder="dateiname.ext"
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
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex h-9 min-w-0 items-stretch border-b border-border bg-panel">
            <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden">
              {tabs.length === 0 ? (
                <span className="flex items-center px-3 text-xs text-muted-foreground">
                  Keine Datei geöffnet
                </span>
              ) : (
                tabs.map((tab) => {
                  const dirty = dirtyFiles.includes(tab);
                  return (
                    <div
                      key={tab}
                      className={`flex shrink-0 items-center gap-2 border-r border-border px-3 text-[13px] ${
                        activeFile === tab ? "bg-editor text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      <button onClick={() => openFile(tab)}>{tab}</button>
                      {dirty ? (
                        <span
                          role="status"
                          aria-label={`${tab}: ungespeicherte Änderungen`}
                          title="Ungespeicherte Änderungen"
                          className="text-[10px] leading-none text-foreground"
                        >
                          ●
                        </span>
                      ) : null}
                      <button
                        aria-label={`${tab} schließen`}
                        onClick={() => {
                          setTabs((current) => current.filter((item) => item !== tab));
                          if (activeFile === tab) setActiveFile(null);
                          vscodeRuntime.closeFile(tab);
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            <div
              data-highlight="vscode.editor"
              onClickCapture={() => inspect("vscode.editor")}
              className="relative min-h-0 min-w-0 flex-1"
            >
              {activeFile ? (
                <div className="flex h-full">
                  <div className="select-none border-r border-border bg-editor px-3 py-3 text-right font-mono text-[12px] leading-6 text-muted-foreground">
                    {(contents[activeFile] ?? "").split("\n").map((_, index) => (
                      <div key={index}>{index + 1}</div>
                    ))}
                  </div>
                  <textarea
                    value={contents[activeFile] ?? ""}
                    onChange={(event) => updateContent(event.target.value)}
                    spellCheck={false}
                    className="h-full min-w-0 flex-1 resize-none bg-editor px-3 py-3 font-mono text-[13px] leading-6 text-foreground outline-none"
                    placeholder="Dateiinhalt bearbeiten..."
                    aria-label="Editor-Inhalt"
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Öffne eine Datei im Explorer, um sie zu bearbeiten.
                </div>
              )}
            </div>
            {artifactPreviewIntegrated ? <ArtifactPreviewPanel /> : null}
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
                  onClick={() => {
                    setPanelOpen(false);
                    vscodeRuntime.setActivePanel(null);
                  }}
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
                  {lines.map((line, index) => (
                    <div key={index} className="whitespace-pre-wrap text-foreground/85">
                      {line}
                    </div>
                  ))}
                  <div
                    className="flex items-center gap-2"
                    data-highlight="vscode.panel.terminal.input"
                  >
                    <span className="text-success">{terminalPrompt}</span>
                    <input
                      ref={terminalInputRef}
                      value={command}
                      onChange={(event) => {
                        setCommand(event.target.value);
                        vscodeRuntime.setTerminalCommand(event.target.value);
                      }}
                      onKeyDown={(event) => event.key === "Enter" && runCommand()}
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

        <aside
          data-highlight="vscode.secondarySideBar"
          onClickCapture={() => inspect("vscode.secondarySideBar")}
          aria-label="Secondary Side Bar"
          className={`flex shrink-0 flex-col overflow-hidden border-l border-border bg-panel transition-all ${
            copilotIntegrated && copilotChatOpen ? "w-40 sm:w-72 md:w-80" : "w-10 sm:w-12"
          }`}
        >
          {copilotIntegrated ? (
            <CopilotPanel
              activeFile={activeFile}
              onApplySuggestion={applyCopilotSuggestion}
              onChatOpenChange={setCopilotChatOpen}
            />
          ) : (
            <div
              className="flex h-full items-start justify-center pt-3 text-muted-foreground"
              title="Secondary Side Bar"
            >
              <span aria-hidden="true" className="text-sm leading-none">
                ···
              </span>
              <span className="sr-only">Secondary Side Bar</span>
            </div>
          )}
        </aside>
      </div>

      <div
        data-highlight="vscode.statusBar"
        onClickCapture={() => inspect("vscode.statusBar")}
        className="flex h-7 min-w-0 shrink-0 items-center gap-2 overflow-hidden border-t border-border bg-statusbar px-2 text-[11px] text-foreground/80 sm:gap-4 sm:px-3"
      >
        <span className="flex shrink-0 items-center gap-1">
          <GitBranch className="h-3.5 w-3.5" /> {branch}
        </span>
        <span className="hidden min-w-0 truncate sm:inline">
          {workspaceMode === "workspace"
            ? "Workspace · 2 Ordner"
            : repoOpen
              ? "Ordner · ai-training-demo"
              : "kein Arbeitskontext"}
        </span>
        <span className="ml-auto hidden min-w-0 truncate text-muted-foreground md:inline">
          {activeFile
            ? `${activeFile} · ${activeFile.endsWith(".py") ? "Python" : "Text"}`
            : "UTF-8"}
        </span>
      </div>
    </div>
  );
}
