import {
  Bot,
  Check,
  ChevronDown,
  FileText,
  Library,
  Menu,
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
import { ExploreInspectButton } from "./ExploreInspectButton";
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
  const normalized = prompt
    .trim()
    .toLocaleLowerCase("de-DE")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const words = normalized.split(/\s+/).filter(Boolean);
  const hasAny = (terms: string[]) => terms.some((term) => normalized.includes(term));

  return {
    goal:
      words.length >= 5 &&
      hasAny([
        "erstelle",
        "fasse",
        "analys",
        "vergleiche",
        "entwurf",
        "liste",
        "schreib",
        "create",
        "summar",
        "analy",
        "compare",
        "draft",
        "write",
      ]),
    context:
      state.groundingMode === "work"
        ? state.contextSourceIds.length > 0 ||
          hasAny(["kontext", "projekt", "besprechung", "pilot", "context", "project", "meeting"])
        : hasAny(["web", "offentlich", "quelle", "public", "source"]),
    audience: hasAny([
      "fur ",
      "furs ",
      "fuer ",
      "team",
      "leitung",
      "management",
      "kunde",
      "kolleg",
      "audience",
      "customer",
      "colleague",
    ]),
    tone: hasAny([
      "sachlich",
      "professionell",
      "kurz",
      "pragnant",
      "freundlich",
      "neutral",
      "ton",
      "professional",
      "concise",
      "friendly",
      "tone",
    ]),
    outputFormat: hasAny([
      "liste",
      "tabelle",
      "punkte",
      "stichpunkt",
      "absatz",
      "mail",
      "zusammenfassung",
      "format",
      "list",
      "table",
      "bullet",
      "paragraph",
      "email",
      "summary",
    ]),
  };
}

export function M365CopilotWorkspace() {
  const { mode, persistRuntimeSnapshot, restoreRuntimeSnapshot } = useTraining();
  const [state, setState] = useState<M365CopilotState>(EMPTY_STATE);
  const [prompt, setPrompt] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const runtimeRootRef = useRef<HTMLDivElement>(null);
  const mobileNavToggleRef = useRef<HTMLButtonElement>(null);
  const mobileNavCloseRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    if (mobileNavOpen) mobileNavCloseRef.current?.focus();
  }, [mobileNavOpen]);

  const sendPrompt = () => {
    if (!prompt.trim()) return;
    m365CopilotRuntime.submitPrompt(assessPromptQuality(prompt, state));
  };

  const closeMobileNavigation = () => {
    setMobileNavOpen(false);
    window.requestAnimationFrame(() => mobileNavToggleRef.current?.focus());
  };

  // Product chrome without state mutation stays non-interactive in the simulation. Explore mode
  // adds the shared inspect affordance so these surfaces remain learnable and keyboard reachable.
  const inspect = (targetRef: string) => {
    if (mode === "explore") m365CopilotRuntime.inspect(targetRef);
  };

  return (
    <div
      ref={runtimeRootRef}
      className="relative flex min-h-0 min-w-0 flex-1 bg-background text-foreground"
      aria-label="Microsoft 365 Copilot Simulation"
    >
      <nav
        id="m365-copilot-navigation"
        className={`${mobileNavOpen ? "absolute inset-y-0 left-0 z-30 block shadow-xl" : "hidden"} w-56 max-w-[calc(100vw-2rem)] shrink-0 overflow-y-auto border-r border-border bg-background p-3 sm:static sm:block sm:max-w-none sm:bg-muted/40 sm:shadow-none`}
        aria-label="Copilot Navigation"
        onKeyDown={(event) => {
          if (event.key === "Escape" && mobileNavOpen) closeMobileNavigation();
        }}
      >
        <div className="mb-4 flex items-center gap-2 px-2 py-1 text-sm font-semibold">
          <Sparkles className="h-4 w-4" />
          <span>Microsoft 365 Copilot</span>
          <button
            ref={mobileNavCloseRef}
            type="button"
            aria-label="Navigation schließen"
            onClick={closeMobileNavigation}
            className="ml-auto rounded-md p-1 hover:bg-muted sm:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {NAV_ITEMS.map(({ target, label, icon: Icon }) => (
          <div
            key={target}
            data-runtime-target={target}
            className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground"
          >
            <Icon className="h-4 w-4" /> {label}
            {mode === "explore" ? (
              <span className="ml-auto">
                <ExploreInspectButton targetRef={target} label={label} onInspect={inspect} />
              </span>
            ) : null}
          </div>
        ))}
        <div data-runtime-target="m365.nav.agents" className="mt-5 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-2 px-3">
            <p className="text-xs font-semibold text-muted-foreground">Agents</p>
            {mode === "explore" ? (
              <ExploreInspectButton
                targetRef="m365.nav.agents"
                label="Agents"
                onInspect={inspect}
              />
            ) : null}
          </div>
          {["Researcher", "Analyst", "Cowork", "Excel", "Word", "PowerPoint"].map((agent) => (
            <div key={agent} className="px-3 py-1.5 text-sm text-muted-foreground">
              {agent}
            </div>
          ))}
          <p className="mt-4 px-3 text-xs font-semibold text-muted-foreground">Notebooks</p>
          <p className="mt-4 px-3 text-xs font-semibold text-muted-foreground">Chats</p>
          <div className="px-3 py-1.5 text-sm">All chats</div>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:gap-3 sm:px-4">
          <button
            ref={mobileNavToggleRef}
            type="button"
            aria-controls="m365-copilot-navigation"
            aria-expanded={mobileNavOpen}
            aria-label="Navigation öffnen"
            onClick={() => setMobileNavOpen(true)}
            className="shrink-0 rounded-md p-2 hover:bg-muted sm:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div
            data-runtime-target="m365.grounding"
            className="flex rounded-full bg-muted p-1"
            aria-label="Grounding auswählen"
          >
            {(["work", "web"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={state.groundingMode === mode}
                onClick={() => m365CopilotRuntime.setGroundingMode(mode)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold sm:px-4 ${state.groundingMode === mode ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              >
                {mode === "work" ? "Work" : "Web"}
              </button>
            ))}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-1 rounded-md px-2 py-1 text-xs sm:flex">
              Auto <ChevronDown className="h-3 w-3" />
            </span>
            <ShieldCheck className="h-4 w-4" aria-label="Enterprise Data Protection" />
            <MoreHorizontal className="hidden h-4 w-4 sm:block" />
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
            {!state.responseVisible ? (
              <div className="my-auto py-8 text-center">
                <Bot className="mx-auto mb-3 h-8 w-8" />
                <h1 className="text-2xl font-semibold">Hi, what can I help you with?</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Simulation mit ausschließlich synthetischen Trainingsdaten
                </p>
              </div>
            ) : (
              <div className="space-y-5 pb-6" aria-live="polite">
                <div className="ml-auto max-w-xl rounded-2xl bg-muted px-4 py-3 text-sm">
                  Deine Anfrage wurde gesendet.
                </div>
                <article data-runtime-target="m365.result" className="max-w-2xl text-sm leading-6">
                  <div className="mb-2 flex items-center gap-2 font-semibold">
                    <Sparkles className="h-4 w-4" /> Copilot
                  </div>
                  <p>
                    Der Pilot soll im Oktober starten. Offen sind der Schulungstermin und die
                    Verantwortlichkeit für die FAQ. Behandle dieses Ergebnis als Entwurf und prüfe
                    Fakten und Zusagen vor der Freigabe.
                  </p>
                  {!state.unsupportedRejected ? (
                    <p className="mt-3 rounded-lg border border-border bg-muted p-3">
                      Unbelegte Aussage: „Das Budget ist bereits verbindlich freigegeben.“
                    </p>
                  ) : null}
                  <div
                    data-runtime-target="m365.result.sources"
                    className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                  >
                    {state.groundingMode === "work" && state.contextSourceIds.length > 0 ? (
                      state.contextSourceIds.map((source) => (
                        <span
                          key={source}
                          className="rounded-full border border-border bg-background px-2 py-1"
                        >
                          {source === "meeting-notes" ? "Besprechungsnotiz" : "Projektsteckbrief"}
                        </span>
                      ))
                    ) : (
                      <span>Keine Mandantenquelle verwendet</span>
                    )}
                    {mode === "explore" ? (
                      <ExploreInspectButton
                        targetRef="m365.result.sources"
                        label="Verwendete Quellen"
                        onInspect={inspect}
                      />
                    ) : null}
                  </div>
                </article>
              </div>
            )}

            <div className="sticky bottom-0 mt-auto">
              {contextOpen ? (
                <div
                  className="mb-2 rounded-xl border border-border bg-background p-3 shadow-lg"
                  data-runtime-target="m365.context"
                >
                  <p className="mb-2 text-xs font-semibold">Kontext hinzufügen</p>
                  {SOURCES.map((source) => {
                    const selected = state.contextSourceIds.includes(source.id);
                    return (
                      <button
                        key={source.id}
                        type="button"
                        data-runtime-target={source.allowed ? undefined : "m365.context.restricted"}
                        onClick={() => m365CopilotRuntime.setContextSource(source.id, !selected)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <span className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {source.label}
                        </span>
                        {!source.allowed ? (
                          <span className="text-xs text-muted-foreground">Gesperrt</span>
                        ) : selected ? (
                          <Check className="h-4 w-4" />
                        ) : null}
                      </button>
                    );
                  })}
                  {state.restrictedSourceAttempted ? (
                    <p className="mt-2 text-xs text-destructive">
                      Der vertrauliche Anhang darf nicht an Copilot übergeben werden.
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div
                data-runtime-target="m365.prompt"
                className="rounded-2xl border border-border bg-background p-3 shadow-sm"
              >
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendPrompt();
                    }
                  }}
                  placeholder="Message Copilot"
                  aria-label="Message Copilot"
                  rows={2}
                  className="w-full resize-none bg-transparent px-1 text-sm outline-none"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Kontext hinzufügen"
                    onClick={() => setContextOpen((open) => !open)}
                    className="rounded-full p-2 hover:bg-muted"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {state.groundingMode === "work"
                      ? "Work nutzt freigegebenen Mandantenkontext"
                      : "Web nutzt keinen Mandantenkontext"}
                  </span>
                  <span aria-hidden="true" className="ml-auto rounded-full p-2">
                    <Mic className="h-4 w-4" />
                  </span>
                  <button
                    type="button"
                    data-runtime-target="m365.prompt.submit"
                    aria-label="Nachricht senden"
                    disabled={!prompt.trim()}
                    onClick={sendPrompt}
                    className="rounded-full bg-primary p-2 text-primary-foreground disabled:opacity-30"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {state.responseVisible ? (
          <aside
            className="border-t border-border bg-background px-4 py-3"
            aria-label="Trainingsprüfung"
          >
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
              <span className="mr-2 text-xs font-semibold text-muted-foreground">
                Plattform-Prüfschritt
              </span>
              <button
                type="button"
                data-runtime-target="m365.review.facts"
                onClick={() => m365CopilotRuntime.markFactsChecked()}
                className="rounded-lg border px-3 py-2 text-xs"
              >
                Fakten prüfen{" "}
                {state.factsChecked ? <Check className="ml-1 inline h-3 w-3" /> : null}
              </button>
              <button
                type="button"
                data-runtime-target="m365.unsupported.reject"
                onClick={() => m365CopilotRuntime.rejectUnsupportedSuggestion()}
                className="rounded-lg border px-3 py-2 text-xs"
              >
                Unbelegte Aussage verwerfen{" "}
                {state.unsupportedRejected ? <X className="ml-1 inline h-3 w-3" /> : null}
              </button>
              <div data-runtime-target="m365.approval" className="ml-auto flex gap-2">
                <button
                  type="button"
                  disabled={!state.factsChecked || !state.unsupportedRejected}
                  onClick={() => m365CopilotRuntime.decideApproval("approved")}
                  className="rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-30"
                >
                  Freigeben
                </button>
                <button
                  type="button"
                  onClick={() => m365CopilotRuntime.decideApproval("rejected")}
                  className="rounded-lg border px-3 py-2 text-xs"
                >
                  Verwerfen
                </button>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
