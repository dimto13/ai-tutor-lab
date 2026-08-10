import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, Sparkles, X } from "lucide-react";
import { copilotRuntime, type CopilotRuntimeState } from "@/runtime/copilotRuntime";
import { resolveCopilotProductProfile } from "@/runtime/copilotProductProfile";
import { vscodeRuntime } from "@/runtime/vscodeRuntime";
import { useTraining } from "@/state/trainingStore";

interface CopilotPanelProps {
  activeFile: string | null;
  onApplySuggestion: (text: string) => void;
  onChatOpenChange?: (open: boolean) => void;
}

interface SuggestionSourceState {
  suggestionId: string;
  file: string;
  content: string;
}

function emptyState(): CopilotRuntimeState {
  const profile = copilotRuntime.getProductProfile();
  return {
    enabled: true,
    chatOpen: false,
    profileId: profile.id,
    productVersion: profile.productVersion,
    mode: profile.defaultMode,
    modelId: profile.defaultModelId,
    conversationId: "",
    messages: [],
    contextActiveFile: null,
    inlineSuggestion: null,
  };
}

export function CopilotPanel({
  activeFile,
  onApplySuggestion,
  onChatOpenChange,
}: CopilotPanelProps) {
  const { mode, scenario } = useTraining();
  const runtimeSeed = scenario.environment?.seed;
  const hostProductId = scenario.environment?.productId;
  const integration = scenario.environment?.integrations?.find(
    ({ runtimeAdapterId }) => runtimeAdapterId === copilotRuntime.id,
  );
  const integrationProductId = integration?.productId;
  const integrationVersion = integration?.version;
  const rootRef = useRef<HTMLDivElement>(null);
  const suggestionSourceRef = useRef<SuggestionSourceState | null>(null);
  const [runtimeState, setRuntimeState] = useState<CopilotRuntimeState>(() => emptyState());
  const [prompt, setPrompt] = useState("");
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [runtimeReady, setRuntimeReady] = useState(false);

  useEffect(() => {
    const container = rootRef.current;
    if (!container || !hostProductId || !integrationProductId || !integrationVersion) return;
    let active = true;

    copilotRuntime.configureProductProfile(
      resolveCopilotProductProfile({
        productId: integrationProductId,
        hostProductId,
        version: integrationVersion,
      }),
    );
    const unsubscribe = copilotRuntime.subscribeState((state) => {
      if (active) setRuntimeState(state);
    });

    void copilotRuntime.mount(container, runtimeSeed).then(() => {
      if (active) setRuntimeReady(true);
    });

    return () => {
      active = false;
      setRuntimeReady(false);
      unsubscribe();
      void copilotRuntime.unmount();
    };
  }, [hostProductId, integrationProductId, integrationVersion, runtimeSeed]);

  useEffect(() => {
    onChatOpenChange?.(runtimeState.chatOpen);
  }, [onChatOpenChange, runtimeState.chatOpen]);

  const inspect = (ref: string) => {
    if (mode === "explore") copilotRuntime.inspect(ref);
  };

  const activeContent = async (): Promise<string | null> => {
    if (!activeFile) return null;
    const contents = await vscodeRuntime.query<Record<string, string>>("filesystem.contents");
    return contents[activeFile] ?? "";
  };

  const offerEditorSuggestion = async () => {
    if (!activeFile || !runtimeState.enabled) return;
    const content = await activeContent();
    if (content === null) return;
    const suggestion = copilotRuntime.offerConfiguredInlineSuggestion(activeFile, content);
    suggestionSourceRef.current = suggestion
      ? { suggestionId: suggestion.id, file: activeFile, content }
      : null;
  };

  useEffect(() => {
    suggestionSourceRef.current = null;
    copilotRuntime.rejectInlineSuggestion();
    if (!runtimeReady || !activeFile) return;
    void offerEditorSuggestion();
    // A rejected suggestion is intentionally regenerated only after a correction request in chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile, runtimeReady]);

  const toggleChat = () => {
    inspect("copilot.chat.toggle");
    copilotRuntime.setChatOpen(!runtimeState.chatOpen);
  };

  const startConversation = () => {
    inspect("copilot.chat.newConversation");
    copilotRuntime.startConversation();
  };

  const attachActiveFile = () => {
    inspect("copilot.chat.addContext");
    if (!activeFile) return;
    copilotRuntime.setContextActiveFile(activeFile);
    setContextMenuOpen(false);
  };

  const removeAttachedContext = () => {
    inspect("copilot.chat.contextAttachment");
    copilotRuntime.setContextActiveFile(null);
  };

  const submitPrompt = async () => {
    const value = prompt.trim();
    if (!value || !runtimeState.enabled) return;
    inspect("copilot.chat.prompt");

    const referencesActiveFile = Boolean(activeFile && value.includes(`#${activeFile}`));
    if (referencesActiveFile && activeFile) {
      copilotRuntime.setContextActiveFile(activeFile);
    }

    const shouldRefreshRejectedSuggestion = runtimeState.inlineSuggestion?.status === "rejected";
    const content = await activeContent();
    copilotRuntime.submitPrompt(value, content);
    setPrompt("");

    if (shouldRefreshRejectedSuggestion && activeFile) {
      const suggestion = copilotRuntime.offerConfiguredInlineSuggestion(activeFile, content ?? "");
      suggestionSourceRef.current = suggestion
        ? { suggestionId: suggestion.id, file: activeFile, content: content ?? "" }
        : null;
    }
  };

  const acceptSuggestion = async () => {
    inspect("copilot.inline.accept");
    const suggestion = runtimeState.inlineSuggestion;
    const source = suggestionSourceRef.current;
    if (!suggestion || suggestion.status !== "pending" || !source || !activeFile) return;

    const currentContent = await activeContent();
    if (
      suggestion.id !== source.suggestionId ||
      suggestion.file !== activeFile ||
      source.file !== activeFile ||
      currentContent === null ||
      currentContent !== source.content
    ) {
      copilotRuntime.rejectInlineSuggestion();
      suggestionSourceRef.current = null;
      return;
    }

    const text = copilotRuntime.acceptInlineSuggestion();
    if (text) onApplySuggestion(text);
    suggestionSourceRef.current = null;
  };

  const rejectSuggestion = () => {
    inspect("copilot.inline.reject");
    suggestionSourceRef.current = null;
    copilotRuntime.rejectInlineSuggestion();
  };

  const visibleSuggestion =
    runtimeState.inlineSuggestion?.status === "pending" &&
    runtimeState.inlineSuggestion.file === activeFile
      ? runtimeState.inlineSuggestion
      : null;

  useEffect(() => {
    if (!visibleSuggestion) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        !(target instanceof HTMLTextAreaElement) ||
        target.getAttribute("aria-label") !== "Editor-Inhalt"
      ) {
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        void acceptSuggestion();
      } else if (event.key === "Escape") {
        event.preventDefault();
        rejectSuggestion();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // The handlers intentionally follow the currently rendered suggestion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSuggestion?.id, activeFile]);

  const editorPortalTarget = useMemo(() => {
    if (typeof document === "undefined") return null;
    return document.querySelector<HTMLElement>('[data-highlight="vscode.editor"]');
  }, [visibleSuggestion?.id, activeFile]);

  const inlineSuggestionPortal =
    editorPortalTarget && visibleSuggestion
      ? createPortal(
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-live="polite">
            <pre
              data-highlight="copilot.inline.suggestion"
              onClick={() => inspect("copilot.inline.suggestion")}
              className="absolute bottom-0 left-12 right-0 top-0 m-0 whitespace-pre-wrap px-3 py-3 font-mono text-[13px] leading-6"
            >
              <span className="invisible">{suggestionSourceRef.current?.content ?? ""}</span>
              <span className="text-muted-foreground/70">{visibleSuggestion.text}</span>
            </pre>
            <div className="pointer-events-auto absolute bottom-3 right-3 flex items-center gap-2 rounded border border-border bg-panel/95 px-2 py-1 text-[11px] text-muted-foreground shadow-lg">
              <span
                data-highlight="copilot.inline.accept"
                onClick={() => inspect("copilot.inline.accept")}
                className="cursor-default"
              >
                <kbd className="rounded bg-editor px-1.5 py-0.5 text-foreground">Tab</kbd> annehmen
              </span>
              <span aria-hidden="true">·</span>
              <span
                data-highlight="copilot.inline.reject"
                onClick={() => inspect("copilot.inline.reject")}
                className="cursor-default"
              >
                <kbd className="rounded bg-editor px-1.5 py-0.5 text-foreground">Esc</kbd> verwerfen
              </span>
            </div>
          </div>,
          editorPortalTarget,
        )
      : null;

  if (!runtimeState.enabled) {
    return (
      <div ref={rootRef} className="p-3 text-xs text-muted-foreground">
        GitHub Copilot ist in diesem Trainingsprofil deaktiviert.
      </div>
    );
  }

  if (!runtimeState.chatOpen) {
    return (
      <>
        <div ref={rootRef} className="flex h-full min-h-0 w-full flex-col items-center py-2">
          <button
            type="button"
            data-highlight="copilot.chat.toggle"
            onClick={toggleChat}
            aria-label="Copilot"
            title="Copilot Chat öffnen"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-accent transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <Sparkles className="h-4 w-4" />
          </button>
          <span
            aria-hidden="true"
            className="mt-3 hidden select-none text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:block"
            style={{ writingMode: "vertical-rl" }}
          >
            Copilot Chat
          </span>
        </div>
        {inlineSuggestionPortal}
      </>
    );
  }

  return (
    <>
      <div
        ref={rootRef}
        data-highlight="copilot.chat"
        onClickCapture={() => inspect("copilot.chat")}
        className="flex h-full min-h-0 w-full flex-col bg-panel"
      >
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-accent" />
            <span className="truncate text-xs font-semibold">Copilot Chat</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-highlight="copilot.chat.newConversation"
              onClick={startConversation}
              aria-label="Neue Copilot-Unterhaltung"
              title="Neue Copilot-Unterhaltung"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={toggleChat}
              aria-label="Copilot Chat schließen"
              title="Copilot Chat schließen"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-2">
          <label className="min-w-0 flex-1 text-[10px] text-muted-foreground">
            <span className="sr-only">Modus</span>
            <span className="relative block">
              <select
                data-highlight="copilot.chat.modeSelector"
                value={runtimeState.mode}
                onFocus={() => inspect("copilot.chat.modeSelector")}
                onChange={(event) =>
                  copilotRuntime.setMode(event.target.value as typeof runtimeState.mode)
                }
                aria-label="Modus"
                className="w-full appearance-none rounded border border-border bg-editor px-2 py-1.5 pr-6 text-[11px] text-foreground outline-none focus:border-ring"
              >
                {copilotRuntime.getProductProfile().chatModes.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.status === "preview" ? `${entry.label} (Preview)` : entry.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2" />
            </span>
          </label>

          <label className="min-w-0 flex-1 text-[10px] text-muted-foreground">
            <span className="sr-only">Modell</span>
            <span className="relative block">
              <select
                data-highlight="copilot.chat.modelSelector"
                value={runtimeState.modelId}
                onFocus={() => inspect("copilot.chat.modelSelector")}
                onChange={(event) => copilotRuntime.setModel(event.target.value)}
                aria-label="Modell"
                className="w-full appearance-none rounded border border-border bg-editor px-2 py-1.5 pr-6 text-[11px] text-foreground outline-none focus:border-ring"
              >
                {copilotRuntime.getProductProfile().models.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2" />
            </span>
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3 text-xs">
          {runtimeState.messages.length === 0 ? (
            <div className="rounded border border-border bg-editor/50 p-2.5 text-muted-foreground">
              <p className="font-medium text-foreground">Wie kann ich helfen?</p>
              <p className="mt-1 leading-relaxed">
                Formuliere ein Ziel und gib nur den Kontext frei, den Copilot dafür wirklich benötigt.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {runtimeState.messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded border px-2.5 py-2 leading-relaxed ${
                    message.role === "user"
                      ? "border-accent/30 bg-accent/10 text-foreground"
                      : "border-border bg-editor/60 text-foreground/85"
                  }`}
                >
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {message.role === "user" ? "Du" : "Copilot"}
                  </div>
                  <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border p-2">
          {runtimeState.contextActiveFile ? (
            <div className="mb-2 flex items-center gap-1.5">
              <span
                data-highlight="copilot.chat.contextAttachment"
                onClick={() => inspect("copilot.chat.contextAttachment")}
                className="inline-flex min-w-0 items-center gap-1 rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] text-foreground"
              >
                <span className="truncate">{runtimeState.contextActiveFile}</span>
                <button
                  type="button"
                  aria-label={`${runtimeState.contextActiveFile} aus Kontext entfernen`}
                  onClick={removeAttachedContext}
                  className="rounded text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          ) : null}

          <div className="relative mb-2">
            <button
              type="button"
              data-highlight="copilot.chat.addContext"
              onClick={() => {
                inspect("copilot.chat.addContext");
                setContextMenuOpen((open) => !open);
              }}
              aria-label="Kontext hinzufügen"
              className="inline-flex items-center gap-1 rounded border border-border bg-editor px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> Kontext hinzufügen
            </button>
            {contextMenuOpen ? (
              <div className="absolute bottom-full left-0 z-30 mb-1 w-full rounded border border-border bg-panel p-1 shadow-xl">
                {activeFile ? (
                  <button
                    type="button"
                    onClick={attachActiveFile}
                    className="w-full rounded px-2 py-1.5 text-left text-[11px] text-foreground hover:bg-white/10"
                  >
                    Datei anhängen: {activeFile}
                  </button>
                ) : (
                  <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                    Öffne zuerst eine Datei im Editor.
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex items-end gap-1.5">
            <textarea
              data-highlight="copilot.chat.prompt"
              value={prompt}
              onFocus={() => inspect("copilot.chat.prompt")}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitPrompt();
                }
              }}
              rows={2}
              placeholder="Ask Copilot... (z. B. #calculator.py)"
              className="min-h-14 min-w-0 flex-1 resize-none rounded border border-border bg-editor px-2 py-1.5 text-[11px] leading-4 text-foreground outline-none focus:border-ring"
            />
            <button
              type="button"
              onClick={() => void submitPrompt()}
              aria-label="Prompt senden"
              className="rounded bg-accent px-2 py-1.5 text-[10px] font-semibold text-accent-foreground hover:opacity-90"
            >
              Senden
            </button>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            Kontext gezielt über + anhängen oder mit #Dateiname im Prompt referenzieren.
          </p>

          {runtimeState.mode === "agent" ? (
            <button
              type="button"
              data-highlight="copilot.chat.stopTask"
              onClick={() => {
                inspect("copilot.chat.stopTask");
                copilotRuntime.stopTask();
              }}
              className="mt-2 w-full rounded border border-border bg-editor px-2 py-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Aufgabe stoppen
            </button>
          ) : null}
        </div>
      </div>
      {inlineSuggestionPortal}
    </>
  );
}
