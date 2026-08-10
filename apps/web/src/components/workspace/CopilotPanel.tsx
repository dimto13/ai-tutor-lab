import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Sparkles, X } from "lucide-react";
import {
  copilotRuntime,
  type CopilotRuntimeState,
  type CopilotSuggestionStatus,
} from "@/runtime/copilotRuntime";
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
  const profile = copilotRuntime.getProductProfile();

  onChatOpenChangeRef.current = onChatOpenChange;

  const inspectTarget = (ref: string) => {
    if (mode === "explore") copilotRuntime.inspect(ref);
  };

  useEffect(() => {
    const container = rootRef.current;
    if (!container || !hostProductId || !integrationProductId || !integrationVersion) return;

    copilotRuntime.configureProductProfile(
      resolveCopilotProductProfile({
        productId: integrationProductId,
        hostProductId,
        version: integrationVersion,
      }),
    );

    const unsubscribe = copilotRuntime.subscribeState((state) => {
      setRuntimeState(state);
      onChatOpenChangeRef.current?.(state.chatOpen);
    });
    void copilotRuntime.mount(container, runtimeSeed);
    return () => {
      unsubscribe();
      onChatOpenChangeRef.current?.(false);
      void copilotRuntime.unmount();
    };
  }, [hostProductId, integrationProductId, integrationVersion, runtimeSeed]);

  useEffect(() => {
    suggestionSourceRef.current = null;
    copilotRuntime.rejectInlineSuggestion();
    copilotRuntime.setContextActiveFile(activeFile);
  }, [activeFile]);

  const activeContent = async (): Promise<string | null> => {
    if (!activeFile) return null;
    const contents = await vscodeRuntime.query<Record<string, string>>("filesystem.contents");
    return contents[activeFile] ?? "";
  };

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

  const submitPrompt = async () => {
    const value = prompt.trim();
    if (!value || !runtimeState.enabled) return;
    copilotRuntime.submitPrompt(value, await activeContent());
    setPrompt("");
  };

  const offerSuggestion = async () => {
    inspectTarget("copilot.inline.generate");
    if (!activeFile || !runtimeState.enabled) return;
    const content = (await activeContent()) ?? "";
    const suggestion = copilotRuntime.offerConfiguredInlineSuggestion(activeFile, content);
    if (!suggestion) {
      suggestionSourceRef.current = null;
      copilotRuntime.rejectInlineSuggestion();
      return;
    }
    suggestionSourceRef.current = {
      suggestionId: suggestion.id,
      file: activeFile,
      content,
    };
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
    runtimeState.inlineSuggestion?.file === activeFile ? runtimeState.inlineSuggestion : null;
  const suggestionStatus: CopilotSuggestionStatus | null = visibleSuggestion?.status ?? null;
  const lastAssistantMessage = [...runtimeState.messages]
    .reverse()
    .find((message) => message.role === "assistant");

  return (
    <div ref={rootRef} className="flex h-full min-h-0 w-full flex-col overflow-hidden">
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
            width: 6rem !important;
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
          className="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel"
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
              onClick={() => {
                inspectTarget("copilot.chat.newConversation");
                copilotRuntime.startConversation();
              }}
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
                  {profile.chatModes.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.label}
                      {mode.status === "preview" ? " (Preview)" : ""}
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
                  {profile.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute bottom-2 right-2 h-3 w-3" />
              </label>
            </div>

            <label className="mb-2 block text-[10px] text-muted-foreground">
              Kontext
              <select
                data-highlight="copilot.chat.contextSelector"
                value={
                  runtimeState.contextActiveFile === activeFile && activeFile ? "active" : "none"
                }
                onFocus={() => inspectTarget("copilot.chat.contextSelector")}
                onChange={(event) => {
                  inspectTarget("copilot.chat.contextSelector");
                  copilotRuntime.setContextActiveFile(
                    event.target.value === "active" ? activeFile : null,
                  );
                }}
                className="mt-1 w-full rounded border border-border bg-editor px-2 py-1.5 text-xs text-foreground outline-none focus:border-ring"
              >
                <option value="active" disabled={!activeFile}>
                  {activeFile ? `Aktive Datei: ${activeFile}` : "Keine aktive Datei verfügbar"}
                </option>
                <option value="none">Keine Datei an Copilot übergeben</option>
              </select>
            </label>

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

            <div className="mt-3 border-t border-border pt-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium text-foreground">Inline-Vorschlag</p>
                  <p className="text-[10px] text-muted-foreground">
                    {activeFile ? `für ${activeFile}` : "öffne zuerst eine Datei"}
                  </p>
                </div>
                <button
                  type="button"
                  data-highlight="copilot.inline.generate"
                  disabled={!activeFile}
                  onClick={() => void offerSuggestion()}
                  className="rounded border border-border px-2 py-1 text-[10px] text-foreground hover:border-ring disabled:opacity-40"
                >
                  Vorschlag erzeugen
                </button>
              </div>

              {visibleSuggestion ? (
                <div
                  data-highlight="copilot.inline.suggestion"
                  onClick={() => inspectTarget("copilot.inline.suggestion")}
                  className="mt-2 rounded border border-border bg-editor p-2"
                >
                  <pre className="whitespace-pre-wrap font-mono text-[11px] text-success">
                    {visibleSuggestion.text}
                  </pre>
                  {suggestionStatus === "pending" ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        data-highlight="copilot.inline.accept"
                        onClick={() => void acceptSuggestion()}
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-foreground hover:border-ring"
                      >
                        <Check className="h-3 w-3" /> Annehmen
                      </button>
                      <button
                        type="button"
                        data-highlight="copilot.inline.reject"
                        onClick={rejectSuggestion}
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-foreground hover:border-ring"
                      >
                        <X className="h-3 w-3" /> Ablehnen
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Status: {suggestionStatus === "accepted" ? "angenommen" : "abgelehnt"}
                    </p>
                  )}
                </div>
              ) : null}
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
    </div>
  );
}
