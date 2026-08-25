import {
  Bot,
  Check,
  ChevronDown,
  FileText,
  Library,
  Mic,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  m365CopilotRuntime,
  type M365CopilotState,
  type M365PromptQuality,
} from "@/runtime/m365CopilotRuntime";
import { useTraining } from "@/state/trainingStore";

const EMPTY_QUALITY: M365PromptQuality = {
  goal: false,
  context: false,
  audience: false,
  tone: false,
  outputFormat: false,
};

const EMPTY_STATE: M365CopilotState = {
  groundingMode: "work",
  contextSourceIds: [],
  restrictedSourceAttempted: false,
  promptSubmitted: false,
  promptQuality: { ...EMPTY_QUALITY },
  responseVisible: false,
  factsChecked: false,
  unsupportedRejected: false,
  approvalDecision: "pending",
};

const SOURCES = [
  { id: "meeting-notes", label: "Besprechungsnotiz", allowed: true },
  { id: "project-brief", label: "Projektsteckbrief", allowed: true },
  { id: "restricted-appendix", label: "Vertraulicher Anhang", allowed: false },
] as const;

const NAV_ITEMS = [
  { target: "m365.nav.newChat", label: "New chat", icon: Plus },
  { target: "m365.nav.search", label: "Search", icon: Search },
  { target: "m365.nav.library", label: "Library", icon: Library },
  { target: "m365.nav.create", label: "Create", icon: Sparkles },
] as const;

function assessPromptQuality(prompt: string, state: M365CopilotState): M365PromptQuality {
  const normalized = prompt.trim().toLocaleLowerCase("de-DE");
  const words = normalized.split(/\s+/).filter(Boolean);
  const hasAny = (terms: string[]) => terms.some((term) => normalized.includes(term));

  return {
    goal: words.length >= 5 && hasAny(["erstelle", "fasse", "analys", "vergleiche", "entwurf", "liste", "schreib"]),
    context:
      state.groundingMode === "work"
        ? state.contextSourceIds.length > 0 || hasAny(["kontext", "projekt", "besprechung", "pilot"])
        : hasAny(["web", "öffentlich", "quelle"]),
    audience: hasAny(["für ", "team", "leitung", "management", "kunde", "kolleg"]),
    tone: hasAny(["sachlich", "professionell", "kurz", "prägnant", "freundlich", "neutral", "ton"]),
    outputFormat: hasAny(["liste", "tabelle", "punkte", "stichpunkt", "absatz", "mail", "zusammenfassung", "format"]),
  };
}

export function M365CopilotWorkspace() {
  const { persistRuntimeSnapshot, restoreRuntimeSnapshot } = useTraining();
  const [state, setState] = useState<M365CopilotState>(EMPTY_STATE);
  const [prompt, setPrompt] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const runtimeRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = runtimeRootRef.current;
    if (!container) return;
    let disposed = false;
    const unsubscribe = m365CopilotRuntime.subscribeState((nextState, reason) => {
      if (disposed) return;
      setState(nextState);
      if (reason === "mutation") persistRuntimeSnapshot(m365CopilotRuntime.id, nextState);
    });
    void (async () => {
      await m365CopilotRuntime.mount(container);
      if (!disposed) await restoreRuntimeSnapshot(m365CopilotRuntime.id);
    })();
    return () => {
      disposed = true;
      unsubscribe();
      void m365CopilotRuntime.unmount();
    };
  }, [persistRuntimeSnapshot, restoreRuntimeSnapshot]);

  const sendPrompt = () => {
    if (!prompt.trim()) return;
    m365CopilotRuntime.submitPrompt(assessPromptQuality(prompt, state));
  };

  return (
    <div ref={runtimeRootRef} className="flex min-h-0 min-w-0 flex-1 bg-[#f7f7fb] text-slate-900" aria-label="Microsoft 365 Copilot Simulation">
      <nav className="hidden w-56 shrink-0 border-r border-slate-200 bg-[#f1f1f7] p-3 sm:block" aria-label="Copilot Navigation">
        <div className="mb-4 flex items-center gap-2 px-2 py-1 text-sm font-semibold"><Sparkles className="h-4 w-4" /> Microsoft 365 Copilot</div>
        {NAV_ITEMS.map(({ target, label, icon: Icon }) => (
          <div key={target} data-runtime-target={target} className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-700">
            <Icon className="h-4 w-4" /> {label}
          </div>
        ))}
        <div data-runtime-target="m365.nav.agents" className="mt-5 border-t border-slate-200 pt-4">
          <p className="px-3 text-xs font-semibold text-slate-500">Agents</p>
          {["Researcher", "Analyst", "Cowork", "Excel", "Word", "PowerPoint"].map((agent) => <div key={agent} className="px-3 py-1.5 text-sm text-slate-700">{agent}</div>)}
          <p className="mt-4 px-3 text-xs font-semibold text-slate-500">Notebooks</p>
          <p className="mt-4 px-3 text-xs font-semibold text-slate-500">Chats</p>
          <div className="px-3 py-1.5 text-sm">All chats</div>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <div data-runtime-target="m365.grounding" className="flex rounded-full bg-slate-100 p-1" aria-label="Grounding auswählen">
            {(["work", "web"] as const).map((mode) => (
              <button key={mode} type="button" aria-pressed={state.groundingMode === mode} onClick={() => m365CopilotRuntime.setGroundingMode(mode)} className={`rounded-full px-4 py-1.5 text-xs font-semibold ${state.groundingMode === mode ? "bg-white shadow-sm" : "text-slate-500"}`}>
                {mode === "work" ? "Work" : "Web"}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-md px-2 py-1 text-xs">Auto <ChevronDown className="h-3 w-3" /></span>
            <ShieldCheck className="h-4 w-4" aria-label="Enterprise Data Protection" />
            <MoreHorizontal className="h-4 w-4" />
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
            {!state.responseVisible ? (
              <div className="my-auto py-8 text-center">
                <Bot className="mx-auto mb-3 h-8 w-8" />
                <h1 className="text-2xl font-semibold">Hi, what can I help you with?</h1>
                <p className="mt-2 text-sm text-slate-500">Simulation mit ausschließlich synthetischen Trainingsdaten</p>
              </div>
            ) : (
              <div className="space-y-5 pb-6" aria-live="polite">
                <div className="ml-auto max-w-xl rounded-2xl bg-slate-200 px-4 py-3 text-sm">{prompt}</div>
                <article data-runtime-target="m365.result" className="max-w-2xl text-sm leading-6">
                  <div className="mb-2 flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4" /> Copilot</div>
                  <p>Der Pilot soll im Oktober starten. Offen sind der Schulungstermin und die Verantwortlichkeit für die FAQ. Behandle dieses Ergebnis als Entwurf und prüfe Fakten und Zusagen vor der Freigabe.</p>
                  {!state.unsupportedRejected ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">Unbelegte Aussage: „Das Budget ist bereits verbindlich freigegeben.“</p> : null}
                  <div data-runtime-target="m365.result.sources" className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    {state.groundingMode === "work" && state.contextSourceIds.length > 0 ? state.contextSourceIds.map((source) => <span key={source} className="rounded-full border border-slate-200 bg-white px-2 py-1">{source === "meeting-notes" ? "Besprechungsnotiz" : "Projektsteckbrief"}</span>) : <span>Keine Mandantenquelle verwendet</span>}
                  </div>
                </article>
              </div>
            )}

            <div className="sticky bottom-0 mt-auto">
              {contextOpen ? (
                <div className="mb-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg" data-runtime-target="m365.context">
                  <p className="mb-2 text-xs font-semibold">Kontext hinzufügen</p>
                  {SOURCES.map((source) => {
                    const selected = state.contextSourceIds.includes(source.id);
                    return (
                      <button key={source.id} type="button" data-runtime-target={source.allowed ? undefined : "m365.context.restricted"} onClick={() => m365CopilotRuntime.setContextSource(source.id, !selected)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50">
                        <span className="flex items-center gap-2"><FileText className="h-4 w-4" />{source.label}</span>
                        {!source.allowed ? <span className="text-xs text-slate-500">Gesperrt</span> : selected ? <Check className="h-4 w-4" /> : null}
                      </button>
                    );
                  })}
                  {state.restrictedSourceAttempted ? <p className="mt-2 text-xs text-amber-700">Der vertrauliche Anhang darf nicht an Copilot übergeben werden.</p> : null}
                </div>
              ) : null}
              <div data-runtime-target="m365.prompt" className="rounded-2xl border border-slate-300 bg-white p-3 shadow-sm">
                <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Message Copilot" aria-label="Message Copilot" rows={2} className="w-full resize-none bg-transparent px-1 text-sm outline-none" />
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" aria-label="Kontext hinzufügen" onClick={() => setContextOpen((open) => !open)} className="rounded-full p-2 hover:bg-slate-100"><Paperclip className="h-4 w-4" /></button>
                  <span className="text-xs text-slate-500">{state.groundingMode === "work" ? "Work nutzt freigegebenen Mandantenkontext" : "Web nutzt keinen Mandantenkontext"}</span>
                  <span aria-hidden="true" className="ml-auto rounded-full p-2"><Mic className="h-4 w-4" /></span>
                  <button type="button" data-runtime-target="m365.prompt.submit" aria-label="Nachricht senden" disabled={!prompt.trim()} onClick={sendPrompt} className="rounded-full bg-slate-900 p-2 text-white disabled:opacity-30"><Send className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {state.responseVisible ? (
          <aside className="border-t border-slate-200 bg-white px-4 py-3" aria-label="Trainingsprüfung">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
              <span className="mr-2 text-xs font-semibold text-slate-500">Plattform-Prüfschritt</span>
              <button type="button" data-runtime-target="m365.review.facts" onClick={() => m365CopilotRuntime.markFactsChecked()} className="rounded-lg border px-3 py-2 text-xs">Fakten prüfen {state.factsChecked ? <Check className="ml-1 inline h-3 w-3" /> : null}</button>
              <button type="button" data-runtime-target="m365.unsupported.reject" onClick={() => m365CopilotRuntime.rejectUnsupportedSuggestion()} className="rounded-lg border px-3 py-2 text-xs">Unbelegte Aussage verwerfen {state.unsupportedRejected ? <X className="ml-1 inline h-3 w-3" /> : null}</button>
              <div data-runtime-target="m365.approval" className="ml-auto flex gap-2">
                <button type="button" disabled={!state.factsChecked || !state.unsupportedRejected} onClick={() => m365CopilotRuntime.decideApproval("approved")} className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white disabled:opacity-30">Freigeben</button>
                <button type="button" onClick={() => m365CopilotRuntime.decideApproval("rejected")} className="rounded-lg border px-3 py-2 text-xs">Verwerfen</button>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
