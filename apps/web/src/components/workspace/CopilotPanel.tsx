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
  const onChatOpenChangeRef = useRef(onChatOpenChange);
  const [runtimeState, setRuntimeState] = useState<CopilotRuntimeState>(() => emptyState());
  const [prompt, setPrompt] = useState("");
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const profile = copilotRuntime.getProductProfile();

  onChatOpenChangeRef.current = onChatOpenChange;

  const inspectTarget = (ref: string) => {
    if (mode === "explore") copilotRuntime.inspect(ref);
  };

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
      if (!active) return;
      setRuntimeState(state);
      onChatOpenChangeRef.current?.(state.chatOpen);
    });
    void copilotRuntime.mount(container, runtimeSeed).then(() => {
      if (active) setRuntimeReady(true);
    });

    return () => {
      active = false;
      setRuntimeReady(false);
      unsubscribe();
      onChatOpenChangeRef.current?.(false);
      void copilotRuntime.unmount();
    };
  }, [hostProductId, integrationProductId, integrationVersion, runtimeSeed]);

  const fileContent = async (filename: string): Promise<string> => {
    const contents = await vscodeRuntime.query<Record<string, string>>("filesystem.contents");
    return contents[filename] ?? "";
  };

  const activeContent = async (): Promise<string | null> => {
    if (!activeFile) return null;
    return fileContent(activeFile);
  };

  const offerEditorSuggestion = async () => {
    if (!activeFile || !runtimeState.enabled) return;
    const content = await activeContent();
    if (content === null) return;
    const suggestion = copilotRuntime.offerConfiguredInlineSuggestion(activeFile, content);
    suggestionSourceRef.current = suggestion
      ? {
          suggestionId: suggestion.id,
          file: activeFile,
          content,
        }
      : null;
  };

  useEffect(() => {
    suggestionSourceRef.current = null;
    copilotRuntime.rejectInlineSuggestion();
    if (!runtimeReady || !activeFile || !runtimeState.enabled) return;
    void offerEditorSuggestion();
    // Suggestions are offered by the editor/runtime itself. A rejected suggestion is regenerated
    // only after the learner asks for a correction in chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile, runtimeReady, runtimeState.enabled]);

  const toggleEnabled = () => {
    copilotRuntime.setEnabled(!runtimeState.enabled);
  };

  const toggleChat = () => {
    inspectTarget("copilot.chat.toggle");
    copilotRuntime.setChatOpen(!runtimeState.chatOpen);
  };

  const closeChat = () => {
    copilotRuntime.setChatOpen(false);
  };

  const startConversation = () => {
    inspectTarget("copilot.chat.newConversation");
    copilotRuntime.startConversation();
  };

  const attachActiveFile = () => {
    inspectTarget("copilot.chat.addContext");
    if (!activeFile) return;
    copilotRuntime.setContextActiveFile(activeFile);
    setContextMenuOpen(false);
  };

  const removeAttachedContext = () => {
    inspectTarget("copilot.chat.contextAttachment");
    copilotRuntime.setContextActiveFile(null);
  };

  const submitPrompt = async () => {
    const value = prompt.trim();
    if (!value || !runtimeState.enabled) return;
    inspectTarget("copilot.chat.prompt");

    const referencesActiveFile = Boolean(activeFile && value.includes(`#${activeFile}`));
    if (referencesActiveFile && activeFile) {
      copilotRuntime.setContextActiveFile(activeFile);
    }

    const contextFile = referencesActiveFile ? activeFile : runtimeState.contextActiveFile;
    const contextContent = contextFile ? await fileContent(contextFile) : null;
    const shouldRefreshRejectedSuggestion = runtimeState.inlineSuggestion?.status === "rejected";

    copilotRuntime.submitPrompt(value, contextContent);
    setPrompt("");

    if (shouldRefreshRejectedSuggestion && activeFile) {
      const content = (await activeContent()) ?? "";
      const suggestion = copilotRuntime.offerConfiguredInlineSuggestion(activeFile, content);
      suggestionSourceRef.current = suggestion
        ? {
            suggestionId: suggestion.id,
            file: activeFile,
            content,
          }
        : null;
    }
  };

  const acceptSuggestion = async () => {
    inspectTarget("copilot.inline.accept");
    const pendingSuggestion = runtimeState.inlineSuggestion;
    const sourceState = suggestionSourceRef.current;
    if (!activeFile || !pendingSuggestion || pendingSuggestion.status !== "pending") return;

    const content = await activeContent();
    if (
      content === null ||
      !sourceState ||
      sourceState.suggestionId !== pendingSuggestion.id ||
      sourceState.file !== activeFile ||
      sourceState.content !== content
    ) {
      suggestionSourceRef.current = null;
      copilotRuntime.rejectInlineSuggestion();
      return;
    }

    const text = copilotRuntime.acceptInlineSuggestion();
    suggestionSourceRef.current = null;
    if (text) onApplySuggestion(text);
  };

  const rejectSuggestion = () => {
    inspectTarget("copilot.inline.reject");
    suggestionSourceRef.current = null;
    copilotRuntime.rejectInlineSuggestion();
  };

  const visibleSuggestion =
    runtimeState.inlineSuggestion?.file === activeFile &&
    runtimeState.inlineSuggestion.status === "pending"
      ? runtimeState.inlineSuggestion
      : null;
  const lastAssistantMessage = [...runtimeState.messages]
    .reverse()
    .find((message) => message.role === "assistant");

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
    // Handlers deliberately track the currently visible suggestion.
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
            <pre className="absolute bottom-0 left-12 right-0 top-0 m-0 whitespace-pre-wrap px-3 py-3 font-mono text-[13px] leading-6">
              <span className="invisible">{suggestionSourceRef.current?.content ?? ""}</span>
              <span className="text-muted-foreground/70">{visibleSuggestion.text}</span>
            </pre>
            <div
              data-highlight="copilot.inline.suggestion"
              onClick={() => inspectTarget("copilot.inline.suggestion")}
              className="pointer-events-auto absolute bottom-3 right-3 max-w-[70%] rounded border border-border bg-panel/95 px-2 py-1 text-[11px] text-muted-foreground shadow-lg"
            >
              <div className="truncate font-mono text-foreground/80">{visibleSuggestion.text.trim()}</div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  data-highlight="copilot.inline.accept"
                  onClick={() => inspectTarget("copilot.inline.accept")}
                  className="cursor-default"
                >
                  <kbd className="rounded bg-editor px-1.5 py-0.5 text-foreground">Tab</kbd> annehmen
                </span>
                <span aria-hidden="true">·</span>
                <span
                  data-highlight="copilot.inline.reject"
                  onClick={() => inspectTarget("copilot.inline.reject")}
                  className="cursor-default"
                >
                  <kbd className="rounded bg-editor px-1.5 py-0.5 text-foreground">Esc</kbd> verwerfen
                </span>
              </div>
            </div>
          </div>,
          editorPortalTarget,
        )
      : null;

  return (
    <div ref={rootRef} className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden">
      <style>{`
        [data-highlight="vscode.secondarySideBar"] {
          transition-property: width !important;
        }

        @media (max-width: 639px) {
          body:has([data-highlight="vscode.secondarySideBar"] [data-highlight="copilot.chat"])
            [data-highlight="vscode.primarySideBar"] {
            display: none;
          }

          [data-highlight="vscode.secondarySideBar"]:has([data-highlight="copilot.chat"]) {
            flex: 0 0 6rem !important;
            width: 6rem !important;
            min-width: 0 !important;
            max-width: 6rem !important;
          }
        }
      `}</style>

      {!runtimeState.chatOpen ? (
        <div className="flex w-full shrink-0 flex-col items-center">
          <button
            type="button"
            data-highlight="copilot.chat.toggle"
            disabled={!runtimeState.enabled}
            onClick={toggleChat}
            aria-label="Copilot"
            title="Copilot Chat öffnen"
            className="flex h-10 w-full shrink-0 items-center justify-center text-foreground transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4 text-accent" />
            <span className="sr-only">Copilot</span>
          </button>
          {runtimeState.enabled ? (
            <button
              type="button"
              onClick={toggleEnabled}
              aria-label="Copilot an"
              aria-pressed="true"
              className="flex h-7 w-full items-center justify-center border-t border-border text-[9px] text-muted-foreground hover:bg-white/5 hover:text-foreground"
              title="GitHub Copilot für diesen Simulator ausschalten"
            >
              An
            </button>
          ) : null}
        </div>
      ) : runtimeState.enabled ? (
        <div
          data-highlight="copilot.chat"
          onPointerDown={() => inspectTarget("copilot.chat")}
          className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden bg-panel"
        >
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-2 py-2">
            <div className="min-w-0 flex-1 basis-28">
              <p className="text-xs font-semibold text-foreground">GitHub Copilot Chat</p>
              <p className="truncate text-[10px] text-muted-foreground">
                Profil {runtimeState.profileId} · {runtimeState.productVersion}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleEnabled}
              aria-pressed={runtimeState.enabled}
              className="rounded border border-border px-1.5 py-1 text-[10px] text-muted-foreground hover:border-ring hover:text-foreground"
              title="GitHub Copilot für diesen Simulator ein-/ausschalten"
            >
              Copilot an
            </button>
            <button
              type="button"
              data-highlight="copilot.chat.newConversation"
              onClick={startConversation}
              className="rounded p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              title="Neue Unterhaltung"
              aria-label="Neue Copilot-Unterhaltung"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              data-highlight="copilot.chat.stopTask"
              onClick={() => {
                inspectTarget("copilot.chat.stopTask");
                copilotRuntime.stopTask();
              }}
              className="rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:border-ring hover:text-foreground"
              title="Eine Copilot-Aufgabe stoppen"
              aria-label="Copilot-Aufgabe stoppen"
            >
              Stoppen
            </button>
            <button
              type="button"
              onClick={closeChat}
              className="rounded p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              aria-label="Copilot Chat schließen"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="relative text-[10px] text-muted-foreground">
                Modus
                <select
                  data-highlight="copilot.chat.modeSelector"
                  value={runtimeState.mode}
                  onFocus={() => inspectTarget("copilot.chat.modeSelector")}
                  onChange={(event) => {
                    inspectTarget("copilot.chat.modeSelector");
                    copilotRuntime.setMode(event.target.value as CopilotRuntimeState["mode"]);
                  }}
                  className="mt-1 w-full appearance-none rounded border border-border bg-editor px-2 py-1.5 pr-6 text-xs text-foreground outline-none focus:border-ring"
                >
                  {profile.chatModes.map((chatMode) => (
                    <option key={chatMode.id} value={chatMode.id}>
                      {chatMode.label}
                      {chatMode.status === "preview" ? " (Preview)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute bottom-2 right-2 h-3 w-3" />
              </label>

              <label className="relative text-[10px] text-muted-foreground">
                Modell
                <select
                  data-highlight="copilot.chat.modelSelector"
                  value={runtimeState.modelId}
                  onFocus={() => inspectTarget("copilot.chat.modelSelector")}
                  onChange={(event) => {
                    inspectTarget("copilot.chat.modelSelector");
                    copilotRuntime.setModel(event.target.value);
                  }}
                  className="mt-1 w-full appearance-none rounded border border-border bg-editor px-2 py-1.5 pr-6 text-xs text-foreground outline-none focus:border-ring"
                >
                  {profile.models.map((modelOption) => (
                    <option key={modelOption.id} value={modelOption.id}>
                      {modelOption.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute bottom-2 right-2 h-3 w-3" />
              </label>
            </div>

            <div className="mb-2">
              <div className="mb-1 flex items-center gap-1.5">
                <button
                  type="button"
                  data-highlight="copilot.chat.addContext"
                  onClick={() => {
                    inspectTarget("copilot.chat.addContext");
                    setContextMenuOpen((open) => !open);
                  }}
                  aria-label="Kontext hinzufügen"
                  className="inline-flex items-center gap-1 rounded border border-border bg-editor px-2 py-1 text-[10px] text-muted-foreground hover:border-ring hover:text-foreground"
                >
                  <Plus className="h-3 w-3" /> Kontext hinzufügen
                </button>
                {runtimeState.contextActiveFile ? (
                  <span
                    data-highlight="copilot.chat.contextAttachment"
                    onClick={() => inspectTarget("copilot.chat.contextAttachment")}
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
                ) : null}
              </div>
              {contextMenuOpen ? (
                <div className="mb-2 rounded border border-border bg-editor p-1">
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
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Dateien gezielt über + anhängen oder im Prompt mit #Dateiname referenzieren.
              </p>
            </div>

            {lastAssistantMessage ? (
              <div className="mb-2 max-h-32 overflow-y-auto rounded border border-border bg-editor p-2 text-xs leading-relaxed text-foreground/90">
                {lastAssistantMessage.content}
              </div>
            ) : null}

            <div className="flex gap-2">
              <input
                data-highlight="copilot.chat.prompt"
                value={prompt}
                onFocus={() => inspectTarget("copilot.chat.prompt")}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submitPrompt();
                }}
                placeholder="Ask Copilot..."
                className="min-w-0 flex-1 rounded border border-border bg-editor px-2 py-1.5 text-xs text-foreground outline-none focus:border-ring"
              />
              <button
                type="button"
                onClick={() => void submitPrompt()}
                className="rounded border border-border px-3 text-xs text-foreground hover:border-ring hover:bg-white/5"
              >
                Senden
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={toggleEnabled}
          className="flex h-10 w-full items-center justify-center text-[10px] text-muted-foreground hover:bg-white/5 hover:text-foreground"
          title="GitHub Copilot wieder aktivieren"
          aria-label="Copilot aus"
        >
          Aus
        </button>
      )}
      {inlineSuggestionPortal}
    </div>
  );
}
