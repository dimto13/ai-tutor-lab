import { z } from "zod";
import type { RuntimeAdapter, RuntimeSeed, RuntimeSurfaceDescription } from "./runtimeAdapter.ts";
import type { TrainingEvent, UiTargetRef } from "../types/training.ts";
import { CLAUDE_CODE_DEFINITION, getClaudeCodeTarget } from "./claudeCodeDefinition.ts";

const changeProposalSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  label: z.string().min(1),
  summary: z.string().min(1).optional(),
  /** Case-insensitive prompt fragments that make the agent offer this change. */
  promptMatch: z.array(z.string().min(1)).min(1).optional(),
  planSteps: z.array(z.string().min(1)).optional(),
  nextContent: z.string(),
  safety: z.enum(["safe", "sensitive"]).optional(),
  safetyReason: z.string().min(1).optional(),
});

const verificationCheckSchema = z.object({
  id: z.string().min(1),
  command: z.string().min(1),
  path: z.string().min(1),
  includes: z.array(z.string()).optional(),
  excludes: z.array(z.string()).optional(),
  passingOutput: z.string().min(1),
  failingOutput: z.string().min(1),
});

const transcriptEntrySchema = z.object({
  role: z.enum(["user", "agent", "system"]),
  text: z.string(),
});

const testRunSchema = z.object({
  id: z.string().min(1),
  command: z.string().min(1),
  passed: z.boolean(),
  output: z.string(),
});

export const claudeCodeSeedSchema = z.object({
  model: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  files: z.record(z.string()).optional(),
  proposals: z.array(changeProposalSchema).optional(),
  initialProposalId: z.string().min(1).optional(),
  checks: z.array(verificationCheckSchema).optional(),
});

export type ClaudeCodeChangeProposal = z.infer<typeof changeProposalSchema>;
export type ClaudeCodeVerificationCheck = z.infer<typeof verificationCheckSchema>;
export type ClaudeCodeTranscriptEntry = z.infer<typeof transcriptEntrySchema>;
export type ClaudeCodeTestRun = z.infer<typeof testRunSchema>;
export type ClaudeCodeSeed = z.infer<typeof claudeCodeSeedSchema>;

export interface ClaudeCodeState {
  sessionActive: boolean;
  model: string;
  cwd: string;
  files: Record<string, string>;
  transcript: ClaudeCodeTranscriptEntry[];
  commands: string[];
  lastPrompt: string | null;
  plan: string[];
  planReviewed: boolean;
  proposals: ClaudeCodeChangeProposal[];
  pendingProposalId: string | null;
  viewedProposalIds: string[];
  appliedProposalIds: string[];
  rejectedProposalIds: string[];
  unsafeApprovalIds: string[];
  taskStatus: "idle" | "running" | "stopped" | "completed";
  stoppedTaskCount: number;
  checks: ClaudeCodeVerificationCheck[];
  testRuns: ClaudeCodeTestRun[];
  verificationPassed: boolean | null;
}

const stateSchema = z.object({
  sessionActive: z.boolean(),
  model: z.string().min(1),
  cwd: z.string().min(1),
  files: z.record(z.string()),
  transcript: z.array(transcriptEntrySchema),
  commands: z.array(z.string()),
  lastPrompt: z.string().nullable(),
  plan: z.array(z.string()),
  planReviewed: z.boolean().default(false),
  proposals: z.array(changeProposalSchema),
  pendingProposalId: z.string().nullable(),
  viewedProposalIds: z.array(z.string()),
  appliedProposalIds: z.array(z.string()),
  rejectedProposalIds: z.array(z.string()),
  unsafeApprovalIds: z.array(z.string()).default([]),
  taskStatus: z.enum(["idle", "running", "stopped", "completed"]).default("idle"),
  stoppedTaskCount: z.number().int().nonnegative().default(0),
  checks: z.array(verificationCheckSchema).default([]),
  testRuns: z.array(testRunSchema).default([]),
  verificationPassed: z.boolean().nullable().default(null),
});

export type ClaudeCodeStateChangeReason = "mount" | "reset" | "mutation" | "restore";
type StateListener = (state: ClaudeCodeState, reason: ClaudeCodeStateChangeReason) => void;
type EventListener = (event: TrainingEvent) => void;

export interface ClaudeCodeRuntimeAdapter extends RuntimeAdapter {
  subscribeState(handler: StateListener): () => void;
  inspect(ref: UiTargetRef): void;
  startSession(): void;
  runCommand(command: string): void;
  submitPrompt(prompt: string): void;
  proposeChange(proposal: ClaudeCodeChangeProposal): void;
  reviewPlan(): void;
  /** Opens the pending change for review; the guided prerequisite for approval. */
  openProposedChange(): void;
  approvePendingChange(): void;
  rejectPendingChange(): void;
  stopTask(): void;
  verifyResult(): boolean;
  reset(): void;
}

const DEFAULT_MODEL = "claude-opus-5";
const DEFAULT_CWD = "~/projekt";

let identifierSequence = 0;

function createIdentifier(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  identifierSequence += 1;
  return `${prefix}-${Date.now()}-${identifierSequence}`;
}

function cloneProposal(proposal: ClaudeCodeChangeProposal): ClaudeCodeChangeProposal {
  return {
    ...proposal,
    ...(proposal.promptMatch ? { promptMatch: [...proposal.promptMatch] } : {}),
    ...(proposal.planSteps ? { planSteps: [...proposal.planSteps] } : {}),
  };
}

function cloneCheck(check: ClaudeCodeVerificationCheck): ClaudeCodeVerificationCheck {
  return {
    ...check,
    ...(check.includes ? { includes: [...check.includes] } : {}),
    ...(check.excludes ? { excludes: [...check.excludes] } : {}),
  };
}

function cloneState(state: ClaudeCodeState): ClaudeCodeState {
  return {
    ...state,
    files: { ...state.files },
    transcript: state.transcript.map((entry) => ({ ...entry })),
    commands: [...state.commands],
    plan: [...state.plan],
    proposals: state.proposals.map(cloneProposal),
    viewedProposalIds: [...state.viewedProposalIds],
    appliedProposalIds: [...state.appliedProposalIds],
    rejectedProposalIds: [...state.rejectedProposalIds],
    unsafeApprovalIds: [...state.unsafeApprovalIds],
    checks: state.checks.map(cloneCheck),
    testRuns: state.testRuns.map((run) => ({ ...run })),
  };
}

export function parseClaudeCodeSeed(seed?: RuntimeSeed): ClaudeCodeSeed | null {
  const raw = seed?.["claudeCode"];
  if (raw === undefined || raw === null) return null;
  return claudeCodeSeedSchema.parse(raw);
}

function initialState(seed?: RuntimeSeed): ClaudeCodeState {
  const parsed = parseClaudeCodeSeed(seed);
  const proposals = (parsed?.proposals ?? []).map(cloneProposal);
  const initialProposal = parsed?.initialProposalId
    ? (proposals.find((proposal) => proposal.id === parsed.initialProposalId) ?? null)
    : null;
  return {
    sessionActive: false,
    model: parsed?.model ?? DEFAULT_MODEL,
    cwd: parsed?.cwd ?? DEFAULT_CWD,
    files: { ...(parsed?.files ?? {}) },
    transcript: [],
    commands: [],
    lastPrompt: null,
    plan: initialProposal?.planSteps ? [...initialProposal.planSteps] : [],
    planReviewed: false,
    proposals,
    pendingProposalId: initialProposal?.id ?? null,
    viewedProposalIds: [],
    appliedProposalIds: [],
    rejectedProposalIds: [],
    unsafeApprovalIds: [],
    taskStatus: initialProposal ? "running" : "idle",
    stoppedTaskCount: 0,
    checks: (parsed?.checks ?? []).map(cloneCheck),
    testRuns: [],
    verificationPassed: null,
  };
}

function normalizeCommand(command: string): string {
  return command.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeContent(content: string): string {
  return content.replace(/\r\n?/g, "\n");
}

function checkPasses(check: ClaudeCodeVerificationCheck, files: Record<string, string>): boolean {
  const content = normalizeContent(files[check.path] ?? "");
  const hasRequiredContent = (check.includes ?? []).every((value) =>
    content.includes(normalizeContent(value)),
  );
  const excludesForbiddenContent = (check.excludes ?? []).every(
    (value) => !content.includes(normalizeContent(value)),
  );
  return hasRequiredContent && excludesForbiddenContent;
}

function allChecksHavePassingLatestRun(
  checks: readonly ClaudeCodeVerificationCheck[],
  testRuns: readonly ClaudeCodeTestRun[],
): boolean {
  if (checks.length === 0) return false;
  return checks.every((check) => {
    const latestRun = [...testRuns].reverse().find((run) => run.id === check.id);
    return latestRun?.passed === true;
  });
}

export function createClaudeCodeRuntime(): ClaudeCodeRuntimeAdapter {
  let state = initialState();
  let mountedInitialState: ClaudeCodeState | null = null;
  let mountedContainer: ParentNode | null = null;
  let activeSessionId = createIdentifier("claude-session");
  const eventListeners = new Set<EventListener>();
  const stateListeners = new Set<StateListener>();

  const replaceState = (nextState: ClaudeCodeState, reason: ClaudeCodeStateChangeReason): void => {
    state = cloneState(nextState);
    const snapshot = cloneState(state);
    for (const listener of stateListeners) listener(snapshot, reason);
  };

  const emit = (type: string, payload: Record<string, unknown>): void => {
    const event: TrainingEvent = {
      id: createIdentifier("claude-event"),
      source: CLAUDE_CODE_DEFINITION.id,
      type,
      timestamp: new Date().toISOString(),
      sessionId: activeSessionId,
      payload,
    };
    for (const listener of eventListeners) listener(event);
  };

  const pendingProposal = (): ClaudeCodeChangeProposal | null =>
    state.proposals.find((proposal) => proposal.id === state.pendingProposalId) ?? null;

  const isUnresolved = (proposal: ClaudeCodeChangeProposal): boolean =>
    !state.appliedProposalIds.includes(proposal.id) &&
    !state.rejectedProposalIds.includes(proposal.id);

  /** Deterministic prompt routing: fragment match first, then the next open proposal. */
  const selectProposalForPrompt = (prompt: string): ClaudeCodeChangeProposal | null => {
    const normalized = prompt.toLowerCase();
    const open = state.proposals.filter(isUnresolved);
    const matched = open.find((proposal) =>
      proposal.promptMatch?.some((fragment) => normalized.includes(fragment.toLowerCase())),
    );
    return matched ?? open.find((proposal) => !proposal.promptMatch) ?? null;
  };

  const appendTranscript = (
    current: ClaudeCodeState,
    entries: ClaudeCodeTranscriptEntry[],
  ): ClaudeCodeTranscriptEntry[] => [...current.transcript, ...entries];

  return {
    id: CLAUDE_CODE_DEFINITION.id,
    productId: CLAUDE_CODE_DEFINITION.productId,
    capabilities: ["terminal", "chat", "agent_mode"] as const,

    async mount(container, seed) {
      const nextInitialState = initialState(seed);
      mountedContainer = container;
      activeSessionId = createIdentifier("claude-session");
      mountedInitialState = nextInitialState;
      replaceState(nextInitialState, "mount");
    },

    async unmount() {
      mountedContainer = null;
      mountedInitialState = null;
    },

    subscribe(handler) {
      eventListeners.add(handler);
      return () => eventListeners.delete(handler);
    },

    subscribeState(handler) {
      stateListeners.add(handler);
      return () => stateListeners.delete(handler);
    },

    query<T = unknown>(selector: string): Promise<T> {
      const pending = pendingProposal();
      const lastTestRun = state.testRuns.at(-1) ?? null;
      const values: Record<string, unknown> = {
        "claude.session.active": state.sessionActive,
        "claude.session.model": state.model,
        "claude.cwd": state.cwd,
        "claude.transcript.entries": state.transcript.map((entry) => ({ ...entry })),
        "claude.prompt.last": state.lastPrompt,
        "claude.plan.steps": [...state.plan],
        "claude.plan.reviewed": state.planReviewed,
        "claude.pendingChange.id": state.pendingProposalId,
        "claude.pendingChange.path": pending?.path ?? null,
        "claude.pendingChange.safety": pending?.safety ?? "safe",
        "claude.pendingChange.safetyReason": pending?.safetyReason ?? null,
        "claude.changes.viewed": [...state.viewedProposalIds],
        "claude.changes.applied": [...state.appliedProposalIds],
        "claude.changes.rejected": [...state.rejectedProposalIds],
        "claude.security.unsafeApprovals": [...state.unsafeApprovalIds],
        "claude.task.status": state.taskStatus,
        "claude.task.stoppedCount": state.stoppedTaskCount,
        "claude.commands.executed": [...state.commands],
        "claude.files": Object.keys(state.files).sort(),
        "claude.files.contents": { ...state.files },
        "claude.tests.runs": state.testRuns.map((run) => ({ ...run })),
        "claude.tests.lastPassed": lastTestRun?.passed ?? null,
        "claude.verification.passed": state.verificationPassed,
      };
      return Promise.resolve(values[selector] as T);
    },

    resolveTarget(ref) {
      if (!mountedContainer || !getClaudeCodeTarget(ref)) return null;
      return (
        mountedContainer
          .querySelector<HTMLElement>(`[data-highlight="${ref}"]`)
          ?.getBoundingClientRect() ?? null
      );
    },

    describeSurface(): RuntimeSurfaceDescription[] {
      return CLAUDE_CODE_DEFINITION.surface.map((entry) => ({ ...entry }));
    },

    snapshot() {
      return Promise.resolve(cloneState(state));
    },

    async restore(snapshot) {
      const result = stateSchema.safeParse(snapshot);
      if (!result.success) throw new TypeError("Invalid claude code snapshot");
      replaceState(result.data, "restore");
    },

    inspect(ref) {
      const target = getClaudeCodeTarget(ref);
      if (!target) return;
      emit("ui.element.inspected", {
        ref,
        label: target.label,
        conceptKey: target.conceptKey,
      });
    },

    startSession() {
      if (state.sessionActive) return;
      replaceState(
        {
          ...state,
          sessionActive: true,
          transcript: appendTranscript(state, [
            { role: "system", text: `Claude Code (${state.model}) in ${state.cwd}` },
          ]),
        },
        "mutation",
      );
      emit("terminal.opened", { cwd: state.cwd, model: state.model });
    },

    runCommand(command) {
      const trimmed = command.trim();
      if (!trimmed) return;
      const normalizedCommand = normalizeCommand(trimmed);
      const check = state.checks.find(
        (candidate) => normalizeCommand(candidate.command) === normalizedCommand,
      );
      const passed = check ? checkPasses(check, state.files) : null;
      const output = check ? (passed ? check.passingOutput : check.failingOutput) : null;
      const nextRun = check
        ? {
            id: check.id,
            command: trimmed,
            passed: passed === true,
            output: output ?? "",
          }
        : null;

      replaceState(
        {
          ...state,
          commands: [...state.commands, trimmed],
          testRuns: nextRun ? [...state.testRuns, nextRun] : state.testRuns,
          transcript: appendTranscript(state, [
            { role: "user", text: `$ ${trimmed}` },
            ...(output ? [{ role: "system" as const, text: output }] : []),
          ]),
          verificationPassed: check ? null : state.verificationPassed,
        },
        "mutation",
      );
      emit("terminal.command.executed", {
        command: trimmed,
        cwd: state.cwd,
        exitCode: passed === false ? 1 : 0,
      });
      if (check) {
        emit("test.completed", { checkId: check.id, command: trimmed, passed });
      }
    },

    submitPrompt(prompt) {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      const proposal = selectProposalForPrompt(trimmed);
      const agentReply = proposal
        ? `Vorschlag: ${proposal.label} (${proposal.path})`
        : "Kein hinterlegter Änderungsvorschlag für diese Anfrage.";

      replaceState(
        {
          ...state,
          lastPrompt: trimmed,
          pendingProposalId: proposal?.id ?? null,
          plan: proposal?.planSteps ? [...proposal.planSteps] : [],
          planReviewed: false,
          taskStatus: proposal ? "running" : "idle",
          verificationPassed: null,
          transcript: appendTranscript(state, [
            { role: "user", text: trimmed },
            { role: "agent", text: agentReply },
          ]),
        },
        "mutation",
      );

      emit("ai.prompt.submitted", {
        prompt: trimmed,
        cwd: state.cwd,
        model: state.model,
        proposalId: proposal?.id ?? null,
      });
      if (proposal) {
        emit("ai.suggestion.shown", {
          proposalId: proposal.id,
          path: proposal.path,
          label: proposal.label,
          safety: proposal.safety ?? "safe",
        });
      }
    },

    proposeChange(value) {
      const proposal = changeProposalSchema.parse(value);
      replaceState(
        {
          ...state,
          proposals: [
            ...state.proposals.filter((candidate) => candidate.id !== proposal.id),
            cloneProposal(proposal),
          ],
          pendingProposalId: proposal.id,
          plan: proposal.planSteps ? [...proposal.planSteps] : [],
          planReviewed: false,
          viewedProposalIds: state.viewedProposalIds.filter((id) => id !== proposal.id),
          appliedProposalIds: state.appliedProposalIds.filter((id) => id !== proposal.id),
          rejectedProposalIds: state.rejectedProposalIds.filter((id) => id !== proposal.id),
          unsafeApprovalIds: state.unsafeApprovalIds,
          taskStatus: "running",
          verificationPassed: null,
          transcript: appendTranscript(state, [
            { role: "agent", text: `Vorschlag: ${proposal.label} (${proposal.path})` },
          ]),
        },
        "mutation",
      );
      emit("ai.suggestion.shown", {
        proposalId: proposal.id,
        path: proposal.path,
        label: proposal.label,
        safety: proposal.safety ?? "safe",
      });
    },

    reviewPlan() {
      if (state.plan.length === 0 || state.planReviewed) return;
      replaceState({ ...state, planReviewed: true }, "mutation");
      emit("ai.plan.reviewed", { proposalId: state.pendingProposalId, steps: [...state.plan] });
    },

    openProposedChange() {
      const proposal = pendingProposal();
      if (!proposal) return;
      if (!state.viewedProposalIds.includes(proposal.id)) {
        replaceState(
          { ...state, viewedProposalIds: [...state.viewedProposalIds, proposal.id] },
          "mutation",
        );
      }
      emit("file.opened", { path: proposal.path, proposalId: proposal.id });
    },

    approvePendingChange() {
      const proposal = pendingProposal();
      if (!proposal) return;
      const unsafeApprovalIds =
        proposal.safety === "sensitive" && !state.unsafeApprovalIds.includes(proposal.id)
          ? [...state.unsafeApprovalIds, proposal.id]
          : state.unsafeApprovalIds;
      replaceState(
        {
          ...state,
          files: { ...state.files, [proposal.path]: proposal.nextContent },
          pendingProposalId: null,
          plan: [],
          planReviewed: false,
          appliedProposalIds: [...state.appliedProposalIds, proposal.id],
          unsafeApprovalIds,
          taskStatus: "completed",
          verificationPassed: null,
          transcript: appendTranscript(state, [
            { role: "system", text: `Freigegeben: ${proposal.path}` },
          ]),
        },
        "mutation",
      );
      emit("ai.suggestion.accepted", {
        proposalId: proposal.id,
        path: proposal.path,
        safety: proposal.safety ?? "safe",
      });
      emit("file.updated", { path: proposal.path, proposalId: proposal.id });
    },

    rejectPendingChange() {
      const proposal = pendingProposal();
      if (!proposal) return;
      replaceState(
        {
          ...state,
          pendingProposalId: null,
          plan: [],
          planReviewed: false,
          rejectedProposalIds: [...state.rejectedProposalIds, proposal.id],
          taskStatus: "idle",
          verificationPassed: null,
          transcript: appendTranscript(state, [
            { role: "system", text: `Abgelehnt: ${proposal.path}` },
          ]),
        },
        "mutation",
      );
      emit("ai.suggestion.rejected", {
        proposalId: proposal.id,
        path: proposal.path,
        safety: proposal.safety ?? "safe",
      });
    },

    stopTask() {
      if (state.pendingProposalId === null && state.plan.length === 0) return;
      replaceState(
        {
          ...state,
          pendingProposalId: null,
          plan: [],
          planReviewed: false,
          taskStatus: "stopped",
          stoppedTaskCount: state.stoppedTaskCount + 1,
          verificationPassed: null,
          transcript: appendTranscript(state, [{ role: "system", text: "Aufgabe gestoppt." }]),
        },
        "mutation",
      );
      emit("ai.task.stopped", { stoppedTaskCount: state.stoppedTaskCount });
    },

    verifyResult() {
      const passed =
        allChecksHavePassingLatestRun(state.checks, state.testRuns) &&
        state.unsafeApprovalIds.length === 0 &&
        state.appliedProposalIds.length > 0 &&
        state.pendingProposalId === null;
      replaceState(
        {
          ...state,
          verificationPassed: passed,
          transcript: appendTranscript(state, [
            {
              role: "system",
              text: passed
                ? "Ergebnis geprüft: Änderung und Teststatus sind plausibel."
                : "Ergebnisprüfung fehlgeschlagen: Änderung, Test oder Sicherheitsentscheidung prüfen.",
            },
          ]),
        },
        "mutation",
      );
      emit("verification.completed", { passed });
      return passed;
    },

    reset() {
      replaceState(mountedInitialState ?? initialState(), "reset");
    },
  };
}

export const claudeCodeRuntime = createClaudeCodeRuntime();
