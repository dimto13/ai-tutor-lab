import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Sparkles, X } from "lucide-react";
import {
  copilotRuntime,
  type CopilotRuntimeState,
  type CopilotSuggestionStatus,
} from "@/runtime/copilotRuntime";

interface CopilotPanelProps {
  activeFile: string | null;
  onApplySuggestion: (text: string) => void;
}

function emptyState(): CopilotRuntimeState {
  const profile = copilotRuntime.getProductProfile();
  return {
    enabled: true,
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

export function CopilotPanel({ activeFile, onApplySuggestion }: CopilotPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [runtimeState, setRuntimeState] = useState<CopilotRuntimeState>(() => emptyState());
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const profile = copilotRuntime.getProductProfile();

  useEffect(() => {
    const container = rootRef.current;
    if (!container) return;

    const unsubscribe = copilotRuntime.subscribeState((state) => setRuntimeState(state));
    void copilotRuntime.mount(container);
    return () => {
      unsubscribe();
      void copilotRuntime.unmount();
    };
  }, []);

  useEffect(() => {
    copilotRuntime.setContextActiveFile(activeFile);
  }, [activeFile]);

  const toggleEnabled = () => {
    const enabled = !runtimeState.enabled;
    copilotRuntime.setEnabled(enabled);
    if (!enabled) setOpen(false);
  };

  const toggleChat = () => {
    setOpen((value) => {
      const nextOpen = !value;
      if (nextOpen) copilotRuntime.openChat();
      return nextOpen;
    });
  };

  const submitPrompt = () => {
    const value = prompt.trim();
    if (!value || !runtimeState.enabled) return;
    copilotRuntime.submitPrompt(value);
    setPrompt("");
  };

  const offerSuggestion = () => {
    if (!activeFile || !runtimeState.enabled) return;
    copilotRuntime.offerInlineSuggestion(activeFile, "\ndef add(a, b):\n    return a + b\n");
  };

  const acceptSuggestion = () => {
    const text = copilotRuntime.acceptInlineSuggestion();
    if (text) onApplySuggestion(text);
  };

  const suggestionStatus: CopilotSuggestionStatus | null =
    runtimeState.inlineSuggestion?.status ?? null;
  const lastAssistantMessage = [...runtimeState.messages]
    .reverse()
    .find((message) => message.role === "assistant");

  return (
    <div ref={rootRef} className="relative flex items-center gap-1">
      <button
        type="button"
        onClick={toggleEnabled}
        aria-pressed={runtimeState.enabled}
        className="rounded border border-border px-1.5 py-1 text-[10px] text-muted-foreground hover:border-ring hover:text-foreground"
        title="GitHub Copilot für diesen Simulator ein-/ausschalten"
      >
        {runtimeState.enabled ? "Copilot an" : "Copilot aus"}
      </button>

      <button
        type="button"
        data-highlight="copilot.chat.toggle"
        disabled={!runtimeState.enabled}
        onClick={toggleChat}
        className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-foreground transition-colors hover:border-ring hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        Copilot
      </button>

      {open && runtimeState.enabled ? (
        <div
          data-highlight="copilot.chat"
          className="absolute right-0 top-9 z-30 w-[28rem] rounded-md border border-border bg-panel p-3 shadow-2xl"
        >
          <div className="mb-3 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">GitHub Copilot Chat</p>
              <p className="truncate text-[10px] text-muted-foreground">
                Profil {runtimeState.profileId} · {runtimeState.productVersion}
              </p>
            </div>
            <button
              type="button"
              data-highlight="copilot.chat.newConversation"
              onClick={() => copilotRuntime.startConversation()}
              className="rounded p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              title="Neue Unterhaltung"
              aria-label="Neue Copilot-Unterhaltung"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              aria-label="Copilot Chat schließen"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-2 grid grid-cols-2 gap-2">
            <label className="relative text-[10px] text-muted-foreground">
              Modus
              <select
                data-highlight="copilot.chat.modeSelector"
                value={runtimeState.mode}
                onChange={(event) =>
                  copilotRuntime.setMode(event.target.value as CopilotRuntimeState["mode"])
                }
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
                onChange={(event) => copilotRuntime.setModel(event.target.value)}
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

          <p className="mb-2 text-[10px] text-muted-foreground">
            Kontext: {runtimeState.contextActiveFile ?? "keine aktive Datei"}
          </p>

          {lastAssistantMessage ? (
            <div className="mb-2 max-h-32 overflow-y-auto rounded border border-border bg-editor p-2 text-xs leading-relaxed text-foreground/90">
              {lastAssistantMessage.content}
            </div>
          ) : null}

          <div className="flex gap-2">
            <input
              data-highlight="copilot.chat.prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submitPrompt()}
              placeholder="Ask Copilot..."
              className="min-w-0 flex-1 rounded border border-border bg-editor px-2 py-1.5 text-xs text-foreground outline-none focus:border-ring"
            />
            <button
              type="button"
              onClick={submitPrompt}
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
                disabled={!activeFile}
                onClick={offerSuggestion}
                className="rounded border border-border px-2 py-1 text-[10px] text-foreground hover:border-ring disabled:opacity-40"
              >
                Vorschlag erzeugen
              </button>
            </div>

            {runtimeState.inlineSuggestion ? (
              <div
                data-highlight="copilot.inline.suggestion"
                className="mt-2 rounded border border-border bg-editor p-2"
              >
                <pre className="whitespace-pre-wrap font-mono text-[11px] text-success">
                  {runtimeState.inlineSuggestion.text}
                </pre>
                {suggestionStatus === "pending" ? (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      data-highlight="copilot.inline.accept"
                      onClick={acceptSuggestion}
                      className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-foreground hover:border-ring"
                    >
                      <Check className="h-3 w-3" /> Annehmen
                    </button>
                    <button
                      type="button"
                      data-highlight="copilot.inline.reject"
                      onClick={() => copilotRuntime.rejectInlineSuggestion()}
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
      ) : null}
    </div>
  );
}
