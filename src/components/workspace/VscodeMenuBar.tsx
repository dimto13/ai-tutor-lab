import { ChevronRight } from "lucide-react";
import { useRef, useState } from "react";

export type VscodeWorkspaceView = "explorer" | "search" | "scm" | "extensions";
export type VscodePanelView = "terminal" | "problems" | "output";

type MenuId = "file" | "edit" | "selection" | "view" | "go" | "run" | "terminal" | "help";

type MenuAction =
  | "open-folder"
  | "open-workspace"
  | "view-explorer"
  | "view-search"
  | "view-scm"
  | "view-extensions"
  | "view-problems"
  | "view-output"
  | "view-terminal"
  | "new-terminal";

interface MenuEntry {
  label: string;
  shortcut?: string;
  action?: MenuAction;
  separatorBefore?: boolean;
  children?: readonly MenuEntry[];
}

interface MenuDefinition {
  id: MenuId;
  label: string;
  target: string;
  entries: readonly MenuEntry[];
}

const MENU_DEFINITIONS: readonly MenuDefinition[] = [
  {
    id: "file",
    label: "File",
    target: "vscode.menu.file",
    entries: [
      { label: "New Text File", shortcut: "Ctrl+N" },
      { label: "New File..." },
      { label: "New Window", shortcut: "Ctrl+Shift+N" },
      { label: "Open File...", shortcut: "Ctrl+O", separatorBefore: true },
      { label: "Open Folder...", action: "open-folder" },
      { label: "Open Workspace from File...", action: "open-workspace" },
      {
        label: "Open Recent",
        children: [
          { label: "ai-training-demo" },
          { label: "ai-training-lab.code-workspace" },
          { label: "More..." },
        ],
      },
      { label: "Add Folder to Workspace..." },
      { label: "Save Workspace As..." },
      { label: "Duplicate Workspace" },
      { label: "Save", shortcut: "Ctrl+S", separatorBefore: true },
      { label: "Save As...", shortcut: "Ctrl+Shift+S" },
      { label: "Save All" },
      { label: "Share", separatorBefore: true, children: [{ label: "Export Profile..." }] },
      { label: "Auto Save" },
      {
        label: "Preferences",
        children: [
          { label: "Settings" },
          { label: "Extensions" },
          { label: "Keyboard Shortcuts" },
          { label: "Configure User Snippets" },
          { label: "Profiles" },
        ],
      },
      { label: "Revert File", separatorBefore: true },
      { label: "Close Editor", shortcut: "Ctrl+W" },
      { label: "Close Folder" },
      { label: "Close Window", shortcut: "Alt+F4" },
      { label: "Exit" },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    target: "vscode.menu.edit",
    entries: [
      { label: "Undo", shortcut: "Ctrl+Z" },
      { label: "Redo", shortcut: "Ctrl+Y" },
      { label: "Cut", shortcut: "Ctrl+X", separatorBefore: true },
      { label: "Copy", shortcut: "Ctrl+C" },
      { label: "Paste", shortcut: "Ctrl+V" },
      { label: "Find", shortcut: "Ctrl+F", separatorBefore: true },
      { label: "Replace", shortcut: "Ctrl+H" },
      { label: "Find in Files", shortcut: "Ctrl+Shift+F" },
      { label: "Replace in Files", shortcut: "Ctrl+Shift+H" },
      { label: "Toggle Line Comment", shortcut: "Ctrl+/", separatorBefore: true },
      { label: "Toggle Block Comment" },
      { label: "Emmet: Expand Abbreviation", shortcut: "Tab" },
    ],
  },
  {
    id: "selection",
    label: "Selection",
    target: "vscode.menu.selection",
    entries: [
      { label: "Select All", shortcut: "Ctrl+A" },
      { label: "Expand Selection", shortcut: "Shift+Alt+Right" },
      { label: "Shrink Selection", shortcut: "Shift+Alt+Left" },
      { label: "Copy Line Up", separatorBefore: true },
      { label: "Copy Line Down", shortcut: "Shift+Alt+Down" },
      { label: "Move Line Up", shortcut: "Alt+Up" },
      { label: "Move Line Down", shortcut: "Alt+Down" },
      { label: "Add Cursor Above", shortcut: "Ctrl+Alt+Up", separatorBefore: true },
      { label: "Add Cursor Below", shortcut: "Ctrl+Alt+Down" },
      { label: "Add Cursors to Line Ends", shortcut: "Shift+Alt+I" },
      { label: "Add Next Occurrence", shortcut: "Ctrl+D" },
      { label: "Add Previous Occurrence" },
      { label: "Select All Occurrences", shortcut: "Ctrl+Shift+L" },
      { label: "Switch to Ctrl+Click for Multi-Cursor", separatorBefore: true },
      { label: "Column Selection Mode" },
    ],
  },
  {
    id: "view",
    label: "View",
    target: "vscode.menu.view",
    entries: [
      { label: "Command Palette...", shortcut: "Ctrl+Shift+P" },
      { label: "Open View..." },
      {
        label: "Appearance",
        separatorBefore: true,
        children: [
          { label: "Full Screen" },
          { label: "Zen Mode" },
          { label: "Centered Layout" },
          { label: "Menu Bar" },
          { label: "Primary Side Bar" },
          { label: "Secondary Side Bar" },
          { label: "Panel" },
          { label: "Status Bar" },
          { label: "Activity Bar Position" },
        ],
      },
      {
        label: "Editor Layout",
        children: [
          { label: "Single" },
          { label: "Split Up" },
          { label: "Split Down" },
          { label: "Split Left" },
          { label: "Split Right" },
          { label: "Two Columns" },
          { label: "Three Columns" },
          { label: "Two Rows" },
          { label: "Three Rows" },
          { label: "Grid (2x2)" },
        ],
      },
      { label: "Explorer", action: "view-explorer", separatorBefore: true },
      { label: "Search", action: "view-search" },
      { label: "Source Control", action: "view-scm" },
      { label: "Run and Debug" },
      { label: "Extensions", action: "view-extensions" },
      { label: "Problems", action: "view-problems", separatorBefore: true },
      { label: "Output", action: "view-output" },
      { label: "Debug Console" },
      { label: "Terminal", action: "view-terminal" },
      { label: "Word Wrap", shortcut: "Alt+Z", separatorBefore: true },
    ],
  },
  {
    id: "go",
    label: "Go",
    target: "vscode.menu.go",
    entries: [
      { label: "Back", shortcut: "Alt+Left" },
      { label: "Forward", shortcut: "Alt+Right" },
      { label: "Last Edit Location" },
      {
        label: "Switch Editor",
        separatorBefore: true,
        children: [
          { label: "Next Editor" },
          { label: "Previous Editor" },
          { label: "Next Used Editor" },
        ],
      },
      {
        label: "Switch Group",
        children: [
          { label: "Group 1" },
          { label: "Group 2" },
          { label: "Next Group" },
          { label: "Previous Group" },
        ],
      },
      { label: "Go to File...", shortcut: "Ctrl+P", separatorBefore: true },
      { label: "Go to Symbol in Workspace...", shortcut: "Ctrl+T" },
      { label: "Go to Symbol in Editor...", shortcut: "Ctrl+Shift+O" },
      { label: "Go to Definition", shortcut: "F12", separatorBefore: true },
      { label: "Go to Declaration" },
      { label: "Go to Type Definition" },
      { label: "Go to Implementations", shortcut: "Ctrl+F12" },
      { label: "Go to References", shortcut: "Shift+F12" },
      { label: "Go to Line/Column...", shortcut: "Ctrl+G", separatorBefore: true },
      { label: "Go to Bracket", shortcut: "Ctrl+Shift+\\" },
      { label: "Next Problem", shortcut: "F8", separatorBefore: true },
      { label: "Previous Problem", shortcut: "Shift+F8" },
      { label: "Next Change", shortcut: "Alt+F3" },
      { label: "Previous Change", shortcut: "Shift+Alt+F3" },
    ],
  },
  {
    id: "run",
    label: "Run",
    target: "vscode.menu.run",
    entries: [
      { label: "Start Debugging", shortcut: "F5" },
      { label: "Run Without Debugging", shortcut: "Ctrl+F5" },
      { label: "Stop Debugging", shortcut: "Shift+F5", separatorBefore: true },
      { label: "Restart Debugging", shortcut: "Ctrl+Shift+F5" },
      { label: "Open Configurations" },
      { label: "Add Configuration..." },
      { label: "Step Over", shortcut: "F10", separatorBefore: true },
      { label: "Step Into", shortcut: "F11" },
      { label: "Step Out", shortcut: "Shift+F11" },
      { label: "Continue", shortcut: "F5" },
      { label: "Toggle Breakpoint", shortcut: "F9", separatorBefore: true },
      {
        label: "New Breakpoint",
        children: [
          { label: "Function Breakpoint" },
          { label: "Data Breakpoint" },
          { label: "Logpoint" },
          { label: "Triggered Breakpoint" },
        ],
      },
      { label: "Enable All Breakpoints" },
      { label: "Disable All Breakpoints" },
      { label: "Remove All Breakpoints" },
      { label: "Install Additional Debuggers...", separatorBefore: true },
    ],
  },
  {
    id: "terminal",
    label: "Terminal",
    target: "vscode.menu.terminal",
    entries: [
      { label: "New Terminal", action: "new-terminal", shortcut: "Ctrl+Shift+`" },
      { label: "Split Terminal", shortcut: "Ctrl+Shift+5" },
      { label: "Run Task...", separatorBefore: true },
      { label: "Run Build Task...", shortcut: "Ctrl+Shift+B" },
      { label: "Run Active File" },
      { label: "Run Selected Text in Active Terminal" },
      { label: "Show Running Tasks...", separatorBefore: true },
      { label: "Restart Running Task..." },
      { label: "Terminate Task..." },
      { label: "Configure Tasks...", separatorBefore: true },
      { label: "Configure Default Build Task..." },
      { label: "Kill Terminal", separatorBefore: true },
      {
        label: "New Terminal with Profile",
        children: [
          { label: "PowerShell" },
          { label: "Command Prompt" },
          { label: "Git Bash" },
        ],
      },
      { label: "Select Default Profile..." },
    ],
  },
  {
    id: "help",
    label: "Help",
    target: "vscode.menu.help",
    entries: [
      { label: "Welcome" },
      { label: "Show All Commands", shortcut: "Ctrl+Shift+P" },
      { label: "Documentation", separatorBefore: true },
      { label: "Editor Playground" },
      { label: "Show Release Notes" },
      { label: "Keyboard Shortcuts Reference" },
      { label: "Video Tutorials" },
      { label: "Tips and Tricks" },
      { label: "Join Us on YouTube", separatorBefore: true },
      { label: "Search Feature Requests" },
      { label: "Report Issue" },
      { label: "View License", separatorBefore: true },
      { label: "Privacy Statement" },
      { label: "Toggle Developer Tools", separatorBefore: true },
      { label: "Open Process Explorer" },
      { label: "Check for Updates...", separatorBefore: true },
      { label: "About" },
    ],
  },
];

interface VscodeMenuBarProps {
  inspect: (target: string) => void;
  openWorkingContext: (mode: "folder" | "workspace") => void;
  openView: (view: VscodeWorkspaceView, target: string) => void;
  openPanel: (panel: VscodePanelView) => void;
  openTerminal: () => void;
}

export function VscodeMenuBar({
  inspect,
  openWorkingContext,
  openView,
  openPanel,
  openTerminal,
}: VscodeMenuBarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [menuLeft, setMenuLeft] = useState(0);
  const activeMenu = MENU_DEFINITIONS.find((menu) => menu.id === openMenu) ?? null;

  const closeMenus = () => {
    setOpenMenu(null);
    setOpenSubmenu(null);
  };

  const runAction = (action: MenuAction | undefined) => {
    if (action === "open-folder") openWorkingContext("folder");
    if (action === "open-workspace") openWorkingContext("workspace");
    if (action === "view-explorer") openView("explorer", "vscode.activityBar.explorer");
    if (action === "view-search") openView("search", "vscode.activityBar.search");
    if (action === "view-scm") openView("scm", "vscode.activityBar.scm");
    if (action === "view-extensions") openView("extensions", "vscode.activityBar.extensions");
    if (action === "view-problems") openPanel("problems");
    if (action === "view-output") openPanel("output");
    if (action === "view-terminal" || action === "new-terminal") openTerminal();
    closeMenus();
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <div className="flex min-w-0 items-center overflow-x-auto overflow-y-hidden">
        {MENU_DEFINITIONS.map((menu) => (
          <button
            key={menu.id}
            type="button"
            data-highlight={menu.target}
            aria-haspopup="menu"
            aria-expanded={openMenu === menu.id}
            onClick={(event) => {
              inspect(menu.target);
              const rootRect = rootRef.current?.getBoundingClientRect();
              const buttonRect = event.currentTarget.getBoundingClientRect();
              const rootWidth = rootRect?.width ?? buttonRect.width;
              const desiredLeft = rootRect ? buttonRect.left - rootRect.left : 0;
              setMenuLeft(Math.max(0, Math.min(desiredLeft, Math.max(0, rootWidth - 288))));
              setOpenSubmenu(null);
              setOpenMenu((current) => (current === menu.id ? null : menu.id));
            }}
            className={`shrink-0 rounded px-2 py-1 hover:bg-white/10 ${
              openMenu === menu.id ? "bg-white/10 text-foreground" : ""
            }`}
          >
            {menu.label}
          </button>
        ))}
      </div>

      {activeMenu ? (
        <div
          role="menu"
          aria-label={`${activeMenu.label} menu`}
          style={{ left: menuLeft }}
          className="absolute top-full z-40 mt-0.5 max-h-[calc(100vh-3rem)] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border border-border bg-panel py-1 shadow-2xl"
        >
          {activeMenu.entries.map((entry) => {
            const submenuKey = `${activeMenu.id}:${entry.label}`;
            return (
              <div key={entry.label} className="relative">
                {entry.separatorBefore ? <div className="my-1 border-t border-border" /> : null}
                <button
                  type="button"
                  role="menuitem"
                  data-highlight={
                    activeMenu.id === "file" && entry.action === "open-folder"
                      ? "vscode.menu.file.openFolder"
                      : activeMenu.id === "file" && entry.action === "open-workspace"
                        ? "vscode.menu.file.openWorkspace"
                        : undefined
                  }
                  onMouseEnter={() => setOpenSubmenu(entry.children ? submenuKey : null)}
                  onClick={() => {
                    if (entry.children) {
                      setOpenSubmenu((current) => (current === submenuKey ? null : submenuKey));
                      return;
                    }
                    if (activeMenu.id === "file" && entry.action === "open-folder") {
                      inspect("vscode.menu.file.openFolder");
                    }
                    if (activeMenu.id === "file" && entry.action === "open-workspace") {
                      inspect("vscode.menu.file.openWorkspace");
                    }
                    runAction(entry.action);
                  }}
                  className="flex w-full items-center gap-6 px-3 py-1.5 text-left text-[12px] text-foreground/90 hover:bg-white/10"
                >
                  <span className="min-w-0 flex-1 whitespace-nowrap">{entry.label}</span>
                  {entry.shortcut ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {entry.shortcut}
                    </span>
                  ) : null}
                  {entry.children ? (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : null}
                </button>

                {entry.children && openSubmenu === submenuKey ? (
                  <div
                    role="menu"
                    aria-label={`${entry.label} submenu`}
                    className="sticky left-0 z-50 mx-2 mb-1 rounded-md border border-border bg-card py-1 shadow-xl"
                  >
                    {entry.children.map((child) => (
                      <button
                        key={child.label}
                        type="button"
                        role="menuitem"
                        onClick={() => runAction(child.action)}
                        className="flex w-full items-center gap-4 px-3 py-1.5 text-left text-[12px] text-foreground/90 hover:bg-white/10"
                      >
                        <span className="min-w-0 flex-1 whitespace-nowrap">{child.label}</span>
                        {child.shortcut ? (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {child.shortcut}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
