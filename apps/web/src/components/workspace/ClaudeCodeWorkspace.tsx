import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  FileDiff,
  FlaskConical,
  FolderTree,
  ListChecks,
  Play,
  SendHorizontal,
  Square,
  Terminal,
  X,
} from "lucide-react";
import { claudeCodeRuntime, type ClaudeCodeState } from "@/runtime/claudeCodeRuntime";
import { useTraining } from "@/state/trainingStore";

const EMPTY_STATE: ClaudeCodeState = {
  sessionActive: false,
  model: "claude-opus-5",
  cwd: "~/projekt",
  files: {},
  transcript: [],
  commands: [],
  lastPrompt: null,
  plan: [],
  planReviewed: false,
  proposals: [],
  pendingProposalId: null,
  viewedProposalIds: [],
  appliedProposalIds: [],
  rejectedProposalIds: [],
  unsafeApprovalIds: [],
  taskStatus: "idle",
  stoppedTaskCount: 0,
  checks: [],
  testRuns: [],
  verificationPassed: null,
};

/** Input starting with one of these runs as a plain command instead of an agent instruction. */
const SHELL_COMMANDS = new Set([
  "ls",
  "dir",
  "pwd",
  "cat",
  "cd",
  "echo",
  "git",
  "tree",
  "mkdir",
  "npm",
  "npx",
]);

function isShellCommand(input: string): boolean {
  const [first] = input.trim().toLowerCase().split(/\s+/);
  return first !== undefined && SHELL_COMMANDS.has(first);
}

export function ClaudeCodeWorkspace() {
  const { mode, scenario, persistRuntimeSnapshot, restoreRuntimeSnapshot } = useTraining();
  const [state, setState] = useState<ClaudeCodeState>(EMPTY_STATE);
  const [input, setInput] = useState("");
  const runtimeRootRef = useRef<HTMLDivElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = runtimeRootRef.current;
    if (!container) return;
    let disposed = false;
    const unsubscribe = claudeCodeRuntime.subscribeState((nextState, reason) => {
      setState(nextState);
      if (reason === "mutation") persistRuntimeSnapshot(claudeCodeRuntime.id, nextState);
    });
    void (async () => {
      await claudeCodeRuntime.mount(container, scenario.environment?.seed);
      if (!disposed) await restoreRuntimeSnapshot(claudeCodeRuntime.id);
    })();
    return () => {
      disposed = true;
      unsubscribe();
      void claudeCodeRuntime.unmount();
    };
  }, [scenario.environment?.seed, persistRuntimeSnapshot, restoreRuntimeSnapshot]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ block: "end" });
  }, [state.transcript.length]);

  const inspect = (ref: string) => {
    if (mode === "explore") claudeCodeRuntime.inspect(ref);
  };

  const pendingProposal =
    state.proposals.find((proposal) => proposal.id === state.pendingProposalId) ?? null;
  const proposalViewed =
    pendingProposal !== null && state.viewedProposalIds.includes(pendingProposal.id);
  const files = Object.keys(state.files).sort();
  const lastTestRun = state.testRuns.at(-1) ?? null;

  const submitInput = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (isShellCommand(text)) claudeCodeRuntime.runCommand(text);
    else claudeCodeRuntime.submitPrompt(text);
  };

  return (
    <div
      ref={runtimeRootRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <div
        data-highlight="claude.session.header"
        onClickCapture={() => inspect("claude.session.header")}
        className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-[#1f1b17] px-4 text-xs text-foreground"
      >
        <Terminal className="h-4 w-4 text-[#d97757]" />
        <span className="font-semibold">Claude Code</span>
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {state.model}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">{state.cwd}</span>
        {state.taskStatus === "running" ? (
          <button
            type="button"
            data-highlight="claude.task.stop"
            onClick={() => {
              inspect("claude.task.stop");
              claudeCodeRuntime.stopTask();
            }}
            className="ml-auto flex items-center gap-1.5 rounded border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-panel"
          >
            <Square className="h-3 w-3" />
            Aufgabe stoppen
          </button>
        ) : state.sessionActive ? (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Sitzung aktiv
          </span>
        ) : (
          <button
            type="button"
            onClick={() => claudeCodeRuntime.startSession()}
            className="ml-auto flex items-center gap-1.5 rounded border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-panel"
          >
            <Play className="h-3 w-3" />
            Sitzung starten
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            data-highlight="claude.transcript"
            onClickCapture={() => inspect("claude.transcript")}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-relaxed"
            aria-label="Verlauf der Sitzung"
          >
            <p
              data-highlight="claude.activity"
              onClickCapture={() => inspect("claude.activity")}
              className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Aktivitätsprotokoll
            </p>
            {state.transcript.length === 0 ? (
              <p className="text-muted-foreground">
                Starte die Sitzung, um mit dem Agenten zu arbeiten.
              </p>
            ) : (
              state.transcript.map((entry, index) => (
                <p
                  key={`${entry.role}-${index}`}
                  className={
                    entry.role === "user"
                      ? "text-foreground"
                      : entry.role === "agent"
                        ? "text-[#d97757]"
                        : "text-muted-foreground"
                  }
                >
                  {entry.role === "agent" ? "⏺ " : ""}
                  {entry.text}
                </p>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>

          {state.plan.length > 0 && (
            <div
              data-highlight="claude.plan"
              onClickCapture={() => inspect("claude.plan")}
              className="shrink-0 border-t border-border bg-panel px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <p className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
                  <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                  Arbeitsplan
                </p>
                {state.planReviewed ? (
                  <span className="ml-auto text-[10px] font-medium text-emerald-300">Plan geprüft</span>
                ) : (
                  <button
                    type="button"
                    data-highlight="claude.plan.review"
                    onClick={() => {
                      inspect("claude.plan.review");
                      claudeCodeRuntime.reviewPlan();
                    }}
                    className="ml-auto rounded border border-border px-2 py-1 text-[10px] font-medium text-foreground hover:bg-background"
                  >
                    Plan prüfen
                  </button>
                )}
              </div>
              <ol className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
                {state.plan.map((step, index) => (
                  <li key={step}>
                    {index + 1}. {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {pendingProposal && (
            <div
              data-highlight="claude.diff"
              onClickCapture={() => inspect("claude.diff")}
              className="shrink-0 border-t border-border bg-panel px-4 py-3"
            >
              <p className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
                <FileDiff className="h-3.5 w-3.5 text-muted-foreground" />
                Änderungsvorschlag: {pendingProposal.label}
              </p>
              {pendingProposal.safety === "sensitive" ? (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {pendingProposal.safetyReason ??
                    "Dieser Vorschlag berührt Inhalte, die nicht ohne Prüfung freigegeben werden dürfen."}
                </p>
              ) : null}
              {proposalViewed ? (
                <>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    Zieldatei: {pendingProposal.path}
                  </p>
                  <pre className="mt-2 max-h-40 overflow-auto rounded border border-border bg-background p-2 font-mono text-[11px] text-emerald-300">
                    {pendingProposal.nextContent}
                  </pre>
                </>
              ) : (
                <div className="mt-1.5 flex items-center gap-3">
                  <p className="text-[11px] text-muted-foreground">
                    {pendingProposal.summary ??
                      "Noch nichts geändert – der Vorschlag ist zugeklappt."}
                  </p>
                  <button
                    type="button"
                    onClick={() => claudeCodeRuntime.openProposedChange()}
                    className="rounded border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-background"
                  >
                    Vorschlag ansehen
                  </button>
                </div>
              )}

              <div
                data-highlight="claude.permission"
                onClickCapture={() => inspect("claude.permission")}
                className="mt-3 flex items-center gap-2"
              >
                <button
                  type="button"
                  data-highlight="claude.approval.approve"
                  onClick={() => {
                    inspect("claude.approval.approve");
                    claudeCodeRuntime.approvePendingChange();
                  }}
                  className="flex items-center gap-1.5 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-500"
                >
                  <Check className="h-3 w-3" />
                  Freigeben
                </button>
                <button
                  type="button"
                  data-highlight="claude.approval.reject"
                  onClick={() => {
                    inspect("claude.approval.reject");
                    claudeCodeRuntime.rejectPendingChange();
                  }}
                  className="flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-background"
                >
                  <X className="h-3 w-3" />
                  Ablehnen
                </button>
              </div>
            </div>
          )}

          <form
            data-highlight="claude.prompt.input"
            onClickCapture={() => inspect("claude.prompt.input")}
            onSubmit={(event) => {
              event.preventDefault();
              submitInput();
            }}
            className="flex shrink-0 items-center gap-2 border-t border-border bg-panel px-4 py-2.5"
          >
            <span className="font-mono text-[12px] text-[#d97757]">&gt;</span>
            <input
              type="text"
              value={input}
              aria-label="Eingabezeile"
              placeholder="Ziel beschreiben oder Kommando eingeben …"
              onChange={(event) => setInput(event.target.value)}
              className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              aria-label="Senden"
              className="rounded border border-border p-1 text-muted-foreground hover:bg-background hover:text-foreground"
            >
              <SendHorizontal className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>

        <aside
          className="hidden w-56 shrink-0 border-l border-border bg-panel px-3 py-3 md:block"
          aria-label="Arbeits- und Prüfinformationen"
        >
          <div
            data-highlight="claude.workspace.files"
            onClickCapture={() => inspect("claude.workspace.files")}
          >
            <p className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
              <FolderTree className="h-3.5 w-3.5 text-muted-foreground" />
              Arbeitsverzeichnis
            </p>
            <ul className="mt-2 space-y-1 font-mono text-[11px] text-muted-foreground">
              {files.length === 0 ? (
                <li>keine Dateien</li>
              ) : (
                files.map((path) => (
                  <li
                    key={path}
                    className={
                      state.appliedProposalIds.length > 0 &&
                      state.proposals.some(
                        (proposal) =>
                          proposal.path === path && state.appliedProposalIds.includes(proposal.id),
                      )
                        ? "text-emerald-300"
                        : undefined
                    }
                  >
                    {path}
                  </li>
                ))
              )}
            </ul>
          </div>

          <div
            data-highlight="claude.verification"
            onClickCapture={() => inspect("claude.verification")}
            className="mt-5 border-t border-border pt-4"
          >
            <p className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
              <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
              Tests und Ergebnis
            </p>
            {lastTestRun ? (
              <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                <p className="font-mono">$ {lastTestRun.command}</p>
                <p className={lastTestRun.passed ? "text-emerald-300" : "text-amber-300"}>
                  {lastTestRun.output}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                Noch kein hinterlegter Prüflauf ausgeführt.
              </p>
            )}
            <button
              type="button"
              onClick={() => claudeCodeRuntime.verifyResult()}
              className="mt-3 w-full rounded border border-border px-2 py-1 text-[10px] font-medium text-foreground hover:bg-background"
            >
              Ergebnis verifizieren
            </button>
            {state.verificationPassed !== null ? (
              <p
                role="status"
                className={`mt-2 text-[10px] ${
                  state.verificationPassed ? "text-emerald-300" : "text-amber-300"
                }`}
              >
                {state.verificationPassed
                  ? "Ergebnis eigenständig verifiziert"
                  : "Ergebnis noch nicht verifiziert"}
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
