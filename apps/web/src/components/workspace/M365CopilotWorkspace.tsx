import { Check, FileText, Mail, MessageSquareText, ShieldCheck, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  m365CopilotRuntime,
  type M365App,
  type M365CopilotState,
  type M365DraftKind,
  type M365PromptQuality,
} from "@/runtime/m365CopilotRuntime";
import { useTraining } from "@/state/trainingStore";

const EMPTY_STATE: M365CopilotState = {
  activeApp: "teams",
  approvedSourceIds: [],
  promptSubmitted: false,
  promptQuality: {
    goal: false,
    context: false,
    audience: false,
    tone: false,
    outputFormat: false,
  },
  draftKind: null,
  factsChecked: false,
  unsupportedRejected: false,
  approvalDecision: "pending",
};

const SYNTHETIC_SOURCES = [
  {
    id: "meeting-notes",
    label: "Teams-Besprechungsnotiz",
    classification: "Intern · KI freigegeben",
    approved: true,
    summary:
      "Entscheidung: Pilotstart im Oktober. Offene Punkte: Schulungstermin und Verantwortlichkeit für die FAQ.",
  },
  {
    id: "project-brief",
    label: "Projektsteckbrief",
    classification: "Intern · KI freigegeben",
    approved: true,
    summary:
      "Ziel: verständliche Einführung für eine interne Pilotgruppe; Ton: sachlich und knapp.",
  },
  {
    id: "restricted-appendix",
    label: "Vertraulicher Anhang",
    classification: "Vertraulich · nicht für KI freigegeben",
    approved: false,
    summary: "Für diese Übung gesperrte Quelle. Inhalt darf nicht an Copilot übergeben werden.",
  },
] as const;

const APP_COPY: Record<M365App, { label: string; role: string; icon: typeof FileText }> = {
  teams: {
    label: "Teams",
    role: "Besprechungsnotizen zusammenfassen und Entscheidungen von offenen Punkten trennen.",
    icon: MessageSquareText,
  },
  word: {
    label: "Word",
    role: "Aus freigegebenem Kontext einen Entwurf erzeugen und fachlich überarbeiten.",
    icon: FileText,
  },
  outlook: {
    label: "Outlook",
    role: "Einen Mail-Entwurf erstellen und Fakten, Zusagen sowie Ton vor Versand prüfen.",
    icon: Mail,
  },
};

const DRAFT_COPY: Record<M365DraftKind, string> = {
  "meeting-summary":
    "Entscheidung: Der Pilot soll im Oktober starten. Offen sind Schulungstermin und FAQ-Verantwortlichkeit.",
  "word-draft":
    "Der interne Pilot startet im Oktober. Die Einführung richtet sich an die Pilotgruppe und soll sachlich sowie knapp erläutert werden.",
  "outlook-draft":
    "Betreff: Nächste Schritte zum Pilotstart\n\nDer Pilot ist für Oktober vorgesehen. Schulungstermin und FAQ-Verantwortlichkeit sind noch offen.",
};

function draftKindForApp(app: M365App): M365DraftKind {
  if (app === "teams") return "meeting-summary";
  if (app === "word") return "word-draft";
  return "outlook-draft";
}

function allPromptFieldsComplete(quality: M365PromptQuality): boolean {
  return Object.values(quality).every(Boolean);
}

export function M365CopilotWorkspace() {
  const { persistRuntimeSnapshot, restoreRuntimeSnapshot } = useTraining();
  const [state, setState] = useState<M365CopilotState>(EMPTY_STATE);
  const [quality, setQuality] = useState<M365PromptQuality>(EMPTY_STATE.promptQuality);
  const runtimeRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = runtimeRootRef.current;
    if (!container) return;
    let disposed = false;
    const unsubscribe = m365CopilotRuntime.subscribeState((nextState, reason) => {
      if (disposed) return;
      setState(nextState);
      setQuality(nextState.promptQuality);
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

  const activeCopy = APP_COPY[state.activeApp];
  const ActiveIcon = activeCopy.icon;
  const visibleDraft = state.draftKind ? DRAFT_COPY[state.draftKind] : null;

  return (
    <div ref={runtimeRootRef} className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-panel px-4 py-2.5">
        <Sparkles className="h-4 w-4 text-accent" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Microsoft 365 Copilot · Simulation
          </p>
          <p className="text-[11px] text-muted-foreground">
            ausschließlich synthetische Trainingsdaten · keine Microsoft-365-Verbindung
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3" /> Datenfreigabe prüfen
        </span>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[190px_minmax(0,1fr)_320px]">
        <nav className="border-r border-border bg-panel p-3" aria-label="M365 Anwendungen">
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Anwendungen
          </p>
          {(Object.keys(APP_COPY) as M365App[]).map((app) => {
            const item = APP_COPY[app];
            const Icon = item.icon;
            return (
              <button
                key={app}
                type="button"
                data-runtime-target={`m365.nav.${app}`}
                onClick={() => m365CopilotRuntime.selectApp(app)}
                className={`mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs ${
                  state.activeApp === app
                    ? "bg-accent/15 text-foreground"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </button>
            );
          })}
          <div className="mt-4 rounded-md border border-border p-3 text-[11px] leading-5 text-muted-foreground">
            <p className="font-semibold text-foreground">Rolle von {activeCopy.label}</p>
            <p className="mt-1">{activeCopy.role}</p>
          </div>
        </nav>

        <main className="min-h-0 overflow-y-auto p-4 sm:p-5">
          <section
            data-runtime-target="m365.sources"
            className="rounded-lg border border-border bg-card p-4"
          >
            <h2 className="text-sm font-semibold text-foreground">1. Quellen und Berechtigungen</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Wähle nur freigegebene synthetische Quellen. Unsicherheit bedeutet: höhere
              Schutzstufe.
            </p>
            <div className="mt-3 space-y-2">
              {SYNTHETIC_SOURCES.map((source) => {
                const selected = state.approvedSourceIds.includes(source.id);
                return (
                  <div key={source.id} className="rounded-md border border-border p-3">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        aria-pressed={selected}
                        disabled={!source.approved}
                        onClick={() => m365CopilotRuntime.setSourceApproved(source.id, !selected)}
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                          selected
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-border text-muted-foreground"
                        } disabled:cursor-not-allowed disabled:opacity-40`}
                        aria-label={`${source.label} ${selected ? "abwählen" : "freigeben"}`}
                      >
                        {selected ? <Check className="h-3 w-3" /> : null}
                      </button>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">{source.label}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {source.classification}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {source.summary}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section
            data-runtime-target="m365.prompt"
            className="mt-4 rounded-lg border border-border bg-card p-4"
          >
            <h2 className="text-sm font-semibold text-foreground">
              2. Arbeitsauftrag strukturieren
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Ein belastbarer Auftrag benennt Ziel, Kontext, Zielgruppe, Ton und Ausgabeformat.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(Object.keys(quality) as (keyof M365PromptQuality)[]).map((key) => {
                const labels: Record<keyof M365PromptQuality, string> = {
                  goal: "Ziel klar benannt",
                  context: "freigegebenen Kontext eingegrenzt",
                  audience: "Zielgruppe benannt",
                  tone: "Ton festgelegt",
                  outputFormat: "Ausgabeformat festgelegt",
                };
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 rounded border border-border px-3 py-2 text-xs text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={quality[key]}
                      onChange={(event) =>
                        setQuality({ ...quality, [key]: event.target.checked })
                      }
                    />
                    {labels[key]}
                  </label>
                );
              })}
            </div>
            <button
              type="button"
              data-runtime-target="m365.prompt.submit"
              disabled={state.approvedSourceIds.length === 0}
              onClick={() => m365CopilotRuntime.submitPrompt(quality)}
              className="mt-3 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground disabled:opacity-40"
            >
              Arbeitsauftrag an Copilot geben
            </button>
            {state.promptSubmitted ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {allPromptFieldsComplete(state.promptQuality)
                  ? "Auftrag enthält alle fünf Qualitätsmerkmale."
                  : "Auftrag ist unvollständig. Prüfe Ziel, Kontext, Zielgruppe, Ton und Format."}
              </p>
            ) : null}
          </section>

          <section
            data-runtime-target="m365.result"
            className="mt-4 rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-center gap-2">
              <ActiveIcon className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold text-foreground">
                3. Ergebnis als Entwurf behandeln
              </h2>
            </div>
            <button
              type="button"
              disabled={!state.promptSubmitted}
              onClick={() => m365CopilotRuntime.createDraft(draftKindForApp(state.activeApp))}
              className="mt-3 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground disabled:opacity-40"
            >
              {activeCopy.label}-Entwurf erzeugen
            </button>
            {visibleDraft ? (
              <div className="mt-3 rounded-md border border-border bg-background p-3 text-xs leading-5 text-foreground">
                <p className="whitespace-pre-wrap">{visibleDraft}</p>
                {!state.unsupportedRejected ? (
                  <p className="mt-3 rounded border border-warning/40 bg-warning/10 p-2 text-warning">
                    Unbelegter Vorschlag: „Das Budget ist bereits verbindlich freigegeben.“
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        </main>

        <aside className="min-h-0 overflow-y-auto border-l border-border bg-panel p-4">
          <h2 className="text-sm font-semibold text-foreground">Qualitäts- und Freigabecheck</h2>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            Copilot liefert einen Entwurf. Verantwortung und Freigabe bleiben beim Menschen.
          </p>

          <button
            type="button"
            data-runtime-target="m365.review.facts"
            disabled={!state.draftKind}
            onClick={() => m365CopilotRuntime.markFactsChecked()}
            className="mt-4 flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-xs text-foreground disabled:opacity-40"
          >
            Namen, Zahlen, Zusagen, Quellen und Ton geprüft
            {state.factsChecked ? <Check className="h-4 w-4 text-accent" /> : null}
          </button>

          <button
            type="button"
            data-runtime-target="m365.unsupported.reject"
            disabled={!state.draftKind}
            onClick={() => m365CopilotRuntime.rejectUnsupportedSuggestion()}
            className="mt-2 flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-xs text-foreground disabled:opacity-40"
          >
            Unbelegte Aussage verwerfen
            {state.unsupportedRejected ? <X className="h-4 w-4 text-accent" /> : null}
          </button>

          <div
            data-runtime-target="m365.approval"
            className="mt-4 rounded-lg border border-border bg-card p-3"
          >
            <p className="text-xs font-semibold text-foreground">Explizite Freigabeentscheidung</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Freigabe erst nach Quellen-, Fakten- und Datenprüfung.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!state.factsChecked || !state.unsupportedRejected}
                onClick={() => m365CopilotRuntime.decideApproval("approved")}
                className="rounded-md bg-accent px-2 py-2 text-xs font-semibold text-accent-foreground disabled:opacity-40"
              >
                Freigeben
              </button>
              <button
                type="button"
                disabled={!state.draftKind}
                onClick={() => m365CopilotRuntime.decideApproval("rejected")}
                className="rounded-md border border-border px-2 py-2 text-xs font-medium text-foreground disabled:opacity-40"
              >
                Verwerfen
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Status:{" "}
              {state.approvalDecision === "pending" ? "noch offen" : state.approvalDecision}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
