import { Bot, Check, FileText, ShieldCheck, Tag, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isAiToolAllowed } from "@ai-train-lab/catalog";
import {
  classificationRuntime,
  type ClassificationSimulatorState,
} from "@/runtime/classificationRuntime";
import { createClassificationRuntimeSeed } from "@/runtime/classificationRuntimeContent";
import { ExploreInspectButton } from "./ExploreInspectButton";
import { useTraining } from "@/state/trainingStore";

const EMPTY_STATE: ClassificationSimulatorState = {
  scheme: null,
  documents: [],
  activeDocumentId: null,
  viewedDocumentIds: [],
  markedIndicatorIds: [],
  selectedLevelId: null,
  aiTool: null,
  aiDecisions: {},
  documentProgress: {},
};

export function ClassificationWorkspace() {
  const { mode, scenario, persistRuntimeSnapshot, restoreRuntimeSnapshot } = useTraining();
  const [state, setState] = useState<ClassificationSimulatorState>(EMPTY_STATE);
  const runtimeRootRef = useRef<HTMLDivElement>(null);
  const runtimeSeed = useMemo(
    () => createClassificationRuntimeSeed(scenario.environment?.seed),
    [scenario.environment?.seed],
  );

  useEffect(() => {
    const container = runtimeRootRef.current;
    if (!container) return;
    let disposed = false;
    const unsubscribe = classificationRuntime.subscribeState((nextState, reason) => {
      if (disposed) return;
      setState(nextState);
      if (reason === "mutation") persistRuntimeSnapshot(classificationRuntime.id, nextState);
    });

    void (async () => {
      await classificationRuntime.mount(container, runtimeSeed);
      if (!disposed) await restoreRuntimeSnapshot(classificationRuntime.id);
    })();

    return () => {
      disposed = true;
      unsubscribe();
      void classificationRuntime.unmount();
    };
  }, [persistRuntimeSnapshot, restoreRuntimeSnapshot, runtimeSeed]);

  const inspect = (targetRef: string) => {
    if (mode === "explore") classificationRuntime.inspect(targetRef);
  };

  const activeDocument =
    state.documents.find((document) => document.id === state.activeDocumentId) ?? null;
  const orderedLevels = state.scheme
    ? [...state.scheme.levels].sort((left, right) => left.rank - right.rank)
    : [];
  const selectedDecision = state.aiTool ? state.aiDecisions[state.aiTool] : undefined;
  const policyAllowed =
    state.scheme && state.aiTool && state.selectedLevelId
      ? isAiToolAllowed(state.scheme, state.aiTool, state.selectedLevelId)
      : null;

  return (
    <div
      ref={runtimeRootRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <header className="flex h-11 shrink-0 items-center border-b border-border bg-panel px-4 text-xs">
        <ShieldCheck className="mr-2 h-4 w-4 text-accent" />
        <span className="font-semibold text-foreground">Klassifizierungs-Simulator</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          ausschließlich synthetische Trainingsdokumente
        </span>
      </header>

      {!state.scheme ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Klassifizierungsschema wird geladen …
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)]">
          <aside
            data-highlight="classification.document.list"
            className="min-h-0 overflow-y-auto border-r border-border bg-panel p-3"
          >
            <div className="flex items-center justify-between gap-2 px-2 pb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Dokumente
              </p>
              {mode === "explore" ? (
                <ExploreInspectButton
                  targetRef="classification.document.list"
                  label="Dokumentliste"
                  onInspect={inspect}
                />
              ) : null}
            </div>
            <div className="space-y-1">
              {state.documents.map((document) => (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => classificationRuntime.viewDocument(document.id)}
                  className={`w-full rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                    document.id === state.activeDocumentId
                      ? "bg-accent/15 text-foreground"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  <span className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      <span className="block font-medium">{document.title}</span>
                      <span className="mt-0.5 block text-[10px] opacity-70">
                        {document.documentType}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto p-5">
            <div className="mx-auto grid max-w-5xl gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
              <section
                data-highlight="classification.document.preview"
                className="min-w-0 rounded-lg border border-border bg-card p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="h-4 w-4" /> Dokumentvorschau
                  </div>
                  {mode === "explore" ? (
                    <ExploreInspectButton
                      targetRef="classification.document.preview"
                      label="Dokumentvorschau"
                      onInspect={inspect}
                    />
                  ) : null}
                </div>
                {activeDocument ? (
                  <>
                    <h2 className="mt-3 text-base font-semibold text-foreground">
                      {activeDocument.title}
                    </h2>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Typ: {activeDocument.documentType}
                    </p>
                    <div className="mt-4 whitespace-pre-wrap rounded-md border border-border bg-background p-4 text-sm leading-6 text-foreground">
                      {activeDocument.content}
                    </div>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">Wähle ein Dokument aus.</p>
                )}
              </section>

              <div className="space-y-4">
                <section
                  data-highlight="classification.indicators"
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-accent" />
                      <h2 className="text-sm font-semibold text-foreground">Merkmale markieren</h2>
                    </div>
                    {mode === "explore" ? (
                      <ExploreInspectButton
                        targetRef="classification.indicators"
                        label="Klassifizierungsmerkmale"
                        onInspect={inspect}
                      />
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-2">
                    {state.scheme.indicators.map((indicator) => {
                      const marked = state.markedIndicatorIds.includes(indicator.id);
                      return (
                        <button
                          key={indicator.id}
                          type="button"
                          aria-pressed={marked}
                          onClick={() => classificationRuntime.markIndicator(indicator.id, !marked)}
                          className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs ${
                            marked
                              ? "border-accent bg-accent/10 text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <span>{indicator.label}</span>
                          {marked ? <Check className="h-3.5 w-3.5" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section
                  data-highlight="classification.levels"
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-foreground">Stufe auswählen</h2>
                    {mode === "explore" ? (
                      <ExploreInspectButton
                        targetRef="classification.levels"
                        label="Klassifizierungsstufen"
                        onInspect={inspect}
                      />
                    ) : null}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {orderedLevels.map((level) => (
                      <button
                        key={level.id}
                        type="button"
                        aria-pressed={state.selectedLevelId === level.id}
                        onClick={() => classificationRuntime.selectLevel(level.id)}
                        className={`rounded-md border px-2 py-2 text-xs ${
                          state.selectedLevelId === level.id
                            ? "border-accent bg-accent/10 text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {level.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section
                  data-highlight="classification.aiDecision"
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-accent" />
                      <h2 className="text-sm font-semibold text-foreground">
                        KI-Nutzung entscheiden
                      </h2>
                    </div>
                    {mode === "explore" ? (
                      <ExploreInspectButton
                        targetRef="classification.aiDecision"
                        label="KI-Nutzungsentscheidung"
                        onInspect={inspect}
                      />
                    ) : null}
                  </div>
                  <label className="mt-3 block text-[11px] text-muted-foreground" htmlFor="ai-tool">
                    KI-Werkzeug
                  </label>
                  <select
                    id="ai-tool"
                    value={state.aiTool ?? ""}
                    onChange={(event) => {
                      if (event.target.value)
                        classificationRuntime.selectAiTool(event.target.value);
                    }}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-xs text-foreground"
                  >
                    {state.aiTool === null ? (
                      <option value="" disabled>
                        KI-Werkzeug auswählen
                      </option>
                    ) : null}
                    {state.scheme.aiPolicy.map((policy) => (
                      <option key={policy.tool} value={policy.tool}>
                        {policy.tool}
                      </option>
                    ))}
                  </select>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      aria-pressed={selectedDecision === true}
                      disabled={!state.aiTool}
                      onClick={() => {
                        if (state.aiTool) classificationRuntime.setAiDecision(state.aiTool, true);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2 py-2 text-xs text-foreground hover:bg-white/5 disabled:opacity-40"
                    >
                      <Check className="h-3.5 w-3.5" /> Zulassen
                    </button>
                    <button
                      type="button"
                      aria-pressed={selectedDecision === false}
                      disabled={!state.aiTool}
                      onClick={() => {
                        if (state.aiTool) classificationRuntime.setAiDecision(state.aiTool, false);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2 py-2 text-xs text-foreground hover:bg-white/5 disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" /> Nicht zulassen
                    </button>
                  </div>
                  {selectedDecision !== undefined && policyAllowed !== null ? (
                    <p className="mt-3 rounded-md bg-background px-3 py-2 text-[11px] text-muted-foreground">
                      Konfigurierte Policy bei der gewählten Stufe: KI-Nutzung ist
                      <strong className="ml-1 text-foreground">
                        {policyAllowed ? "zulässig" : "nicht zulässig"}
                      </strong>
                      .
                    </p>
                  ) : null}
                </section>
              </div>
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
