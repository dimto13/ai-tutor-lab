import { workspaceBus } from "../state/eventBus.ts";
import type { UiTargetRef } from "../types/training.ts";
import type { RuntimeAdapter, RuntimeSeed, RuntimeSurfaceDescription } from "./runtimeAdapter.ts";
import {
  getSourceControlPlatformTarget,
  SOURCE_CONTROL_PLATFORM_DEFINITION,
} from "./sourceControlPlatformDefinition.ts";

export type PlatformView = "overview" | "code" | "commits" | "pull-requests" | "issues";
export type PlatformCheckStatus = "pending" | "success";

export interface SourceControlPlatformState {
  platformName: string;
  repositoryOwner: string;
  repositoryName: string;
  repositoryFiles: string[];
  commitHistory: Array<[string, string, string]>;
  latestCommitRelativeTime: string;
  diffFilePath: string;
  diffContextOldLine: string;
  diffContextNewLine: string;
  diffContextText: string;
  diffAddedNewLine: string;
  diffAddedText: string;
  reviewAuthor: string;
  reviewBody: string;
  activeView: PlatformView;
  currentBranch: string;
  branches: string[];
  branchMenuOpen: boolean;
  pullRequestCreated: boolean;
  pullRequestTitle: string;
  pullRequestDescription: string;
  pullRequestHeadBranch: string;
  diffViewed: boolean;
  reviewReplied: boolean;
  reviewReply: string;
  checkStatus: PlatformCheckStatus;
  mergeReady: boolean;
  issueOpened: boolean;
}

export type SourceControlPlatformStateChangeReason = "mount" | "reset" | "mutation" | "restore";

type StateListener = (
  state: SourceControlPlatformState,
  reason: SourceControlPlatformStateChangeReason,
) => void;

export interface SourceControlPlatformAdapter extends RuntimeAdapter {
  inspect(ref: UiTargetRef): void;
  reset(): void;
  subscribeState(handler: StateListener): () => void;
  openView(view: PlatformView): void;
  setBranchMenuOpen(open: boolean): void;
  createBranch(name: string): void;
  createPullRequest(title: string, description: string): void;
  viewDiff(): void;
  replyToReview(reply: string): void;
  completeChecks(): void;
  inspectMergeReadiness(): void;
  openIssue(): void;
}

const initialState = (): SourceControlPlatformState => ({
  platformName: "GitHub",
  repositoryOwner: "contoso-labs",
  repositoryName: "onboarding-guide",
  repositoryFiles: ["docs/", "src/", "README.md", "CONTRIBUTING.md"],
  commitHistory: [
    ["a1b2c3d", "Dokumentation für neue Teammitglieder vorbereiten", "Maria Schmidt"],
    ["9f8e7d6", "Beispiele für lokale Einrichtung ergänzen", "Jonas Weber"],
    ["4c3b2a1", "Projektstruktur initialisieren", "Maria Schmidt"],
  ],
  latestCommitRelativeTime: "vor 2 Stunden",
  diffFilePath: "README.md",
  diffContextOldLine: "8",
  diffContextNewLine: "8",
  diffContextText: "## Projekt lokal starten",
  diffAddedNewLine: "9",
  diffAddedText: "+ Folge der geprüften Einrichtung in docs/setup.md.",
  reviewAuthor: "Jonas Weber",
  reviewBody:
    "Bitte bestätige, dass der neue Einstieg keine internen Zugangsdaten enthält und der Link zur Einrichtung geprüft wurde.",
  activeView: "overview",
  currentBranch: "main",
  branches: ["main"],
  branchMenuOpen: false,
  pullRequestCreated: false,
  pullRequestTitle: "",
  pullRequestDescription: "",
  pullRequestHeadBranch: "",
  diffViewed: false,
  reviewReplied: false,
  reviewReply: "",
  checkStatus: "pending",
  mergeReady: false,
  issueOpened: false,
});

function cloneState(value: SourceControlPlatformState): SourceControlPlatformState {
  return {
    ...value,
    branches: [...value.branches],
    repositoryFiles: [...value.repositoryFiles],
    commitHistory: value.commitHistory.map(
      ([hash, message, author]) => [hash, message, author] as [string, string, string],
    ),
  };
}

function hasOwn(seed: RuntimeSeed, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(seed, key);
}

function stringFromSeed(seed: RuntimeSeed, key: string, fallback: string): string {
  if (!hasOwn(seed, key)) return fallback;
  const value = seed[key];
  if (typeof value !== "string") {
    throw new TypeError(`Invalid source-control platform runtime seed field: ${key}`);
  }
  return value;
}

function stringArrayFromSeed(seed: RuntimeSeed, key: string, fallback: string[]): string[] {
  if (!hasOwn(seed, key)) return [...fallback];
  const value = seed[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new TypeError(`Invalid source-control platform runtime seed field: ${key}`);
  }
  return [...new Set(value)];
}

function commitHistoryFromSeed(
  seed: RuntimeSeed,
  key: string,
  fallback: Array<[string, string, string]>,
): Array<[string, string, string]> {
  if (!hasOwn(seed, key)) {
    return fallback.map(([hash, message, author]) => [hash, message, author]);
  }
  const value = seed[key];
  if (
    !Array.isArray(value) ||
    !value.every(
      (item) =>
        Array.isArray(item) && item.length === 3 && item.every((part) => typeof part === "string"),
    )
  ) {
    throw new TypeError(`Invalid source-control platform runtime seed field: ${key}`);
  }
  return value.map((item) => [item[0], item[1], item[2]] as [string, string, string]);
}

function booleanFromSeed(seed: RuntimeSeed, key: string, fallback: boolean): boolean {
  if (!hasOwn(seed, key)) return fallback;
  const value = seed[key];
  if (typeof value !== "boolean") {
    throw new TypeError(`Invalid source-control platform runtime seed field: ${key}`);
  }
  return value;
}

function stateFromSeed(seed?: RuntimeSeed): SourceControlPlatformState {
  const base = initialState();
  if (!seed) return base;
  const currentBranch = stringFromSeed(seed, "currentBranch", base.currentBranch);
  const branches = stringArrayFromSeed(seed, "branches", base.branches);
  const pullRequestCreated = booleanFromSeed(seed, "pullRequestCreated", base.pullRequestCreated);
  const seededState = {
    ...base,
    platformName: stringFromSeed(seed, "platformName", base.platformName),
    repositoryOwner: stringFromSeed(seed, "repositoryOwner", base.repositoryOwner),
    repositoryName: stringFromSeed(seed, "repositoryName", base.repositoryName),
    repositoryFiles: stringArrayFromSeed(seed, "repositoryFiles", base.repositoryFiles),
    commitHistory: commitHistoryFromSeed(seed, "commitHistory", base.commitHistory),
    latestCommitRelativeTime: stringFromSeed(
      seed,
      "latestCommitRelativeTime",
      base.latestCommitRelativeTime,
    ),
    diffFilePath: stringFromSeed(seed, "diffFilePath", base.diffFilePath),
    diffContextOldLine: stringFromSeed(seed, "diffContextOldLine", base.diffContextOldLine),
    diffContextNewLine: stringFromSeed(seed, "diffContextNewLine", base.diffContextNewLine),
    diffContextText: stringFromSeed(seed, "diffContextText", base.diffContextText),
    diffAddedNewLine: stringFromSeed(seed, "diffAddedNewLine", base.diffAddedNewLine),
    diffAddedText: stringFromSeed(seed, "diffAddedText", base.diffAddedText),
    reviewAuthor: stringFromSeed(seed, "reviewAuthor", base.reviewAuthor),
    reviewBody: stringFromSeed(seed, "reviewBody", base.reviewBody),
    currentBranch,
    branches: branches.includes(currentBranch) ? branches : [...branches, currentBranch],
    pullRequestCreated,
    pullRequestTitle: stringFromSeed(seed, "pullRequestTitle", base.pullRequestTitle),
    pullRequestDescription: stringFromSeed(
      seed,
      "pullRequestDescription",
      base.pullRequestDescription,
    ),
    pullRequestHeadBranch: stringFromSeed(
      seed,
      "pullRequestHeadBranch",
      base.pullRequestHeadBranch,
    ),
    diffViewed: booleanFromSeed(seed, "diffViewed", base.diffViewed),
    reviewReplied: booleanFromSeed(seed, "reviewReplied", base.reviewReplied),
    reviewReply: stringFromSeed(seed, "reviewReply", base.reviewReply),
    issueOpened: booleanFromSeed(seed, "issueOpened", base.issueOpened),
  };
  seededState.mergeReady = mergeReady(seededState);
  return seededState;
}

function isRuntimeState(value: unknown): value is SourceControlPlatformState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<SourceControlPlatformState>;
  return (
    typeof candidate.platformName === "string" &&
    typeof candidate.repositoryOwner === "string" &&
    typeof candidate.repositoryName === "string" &&
    Array.isArray(candidate.repositoryFiles) &&
    candidate.repositoryFiles.every((file) => typeof file === "string") &&
    Array.isArray(candidate.commitHistory) &&
    candidate.commitHistory.every(
      (commit) =>
        Array.isArray(commit) &&
        commit.length === 3 &&
        commit.every((part) => typeof part === "string"),
    ) &&
    typeof candidate.latestCommitRelativeTime === "string" &&
    typeof candidate.diffFilePath === "string" &&
    typeof candidate.diffContextOldLine === "string" &&
    typeof candidate.diffContextNewLine === "string" &&
    typeof candidate.diffContextText === "string" &&
    typeof candidate.diffAddedNewLine === "string" &&
    typeof candidate.diffAddedText === "string" &&
    typeof candidate.reviewAuthor === "string" &&
    typeof candidate.reviewBody === "string" &&
    (candidate.activeView === "overview" ||
      candidate.activeView === "code" ||
      candidate.activeView === "commits" ||
      candidate.activeView === "pull-requests" ||
      candidate.activeView === "issues") &&
    typeof candidate.currentBranch === "string" &&
    Array.isArray(candidate.branches) &&
    candidate.branches.every((branch) => typeof branch === "string") &&
    typeof candidate.branchMenuOpen === "boolean" &&
    typeof candidate.pullRequestCreated === "boolean" &&
    typeof candidate.pullRequestTitle === "string" &&
    typeof candidate.pullRequestDescription === "string" &&
    typeof candidate.pullRequestHeadBranch === "string" &&
    typeof candidate.diffViewed === "boolean" &&
    typeof candidate.reviewReplied === "boolean" &&
    typeof candidate.reviewReply === "string" &&
    (candidate.checkStatus === "pending" || candidate.checkStatus === "success") &&
    typeof candidate.mergeReady === "boolean" &&
    typeof candidate.issueOpened === "boolean"
  );
}

let state = initialState();
let mountedContainer: HTMLElement | null = null;
let mountedInitialState: SourceControlPlatformState | null = null;
const stateListeners = new Set<StateListener>();
let identifierSequence = 0;
let activeSessionId = createIdentifier("session");

function createIdentifier(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  identifierSequence += 1;
  return `${prefix}-${Date.now()}-${identifierSequence}`;
}

function replaceState(
  nextState: SourceControlPlatformState,
  reason: SourceControlPlatformStateChangeReason,
): void {
  state = cloneState(nextState);
  const snapshot = cloneState(state);
  for (const listener of stateListeners) listener(snapshot, reason);
}

function mergeReady(next: SourceControlPlatformState): boolean {
  return (
    next.pullRequestCreated &&
    next.pullRequestHeadBranch !== "main" &&
    next.pullRequestDescription.trim().length > 0 &&
    next.diffViewed &&
    next.reviewReplied &&
    next.checkStatus === "success"
  );
}

function mutate(update: Partial<SourceControlPlatformState>): SourceControlPlatformState {
  const next = { ...state, ...update };
  next.mergeReady = mergeReady(next);
  replaceState(next, "mutation");
  return next;
}

export const sourceControlPlatformRuntime: SourceControlPlatformAdapter = {
  id: SOURCE_CONTROL_PLATFORM_DEFINITION.id,
  productId: SOURCE_CONTROL_PLATFORM_DEFINITION.productId,
  capabilities: ["source_control"] as const,

  async mount(container, seed) {
    const nextInitialState = stateFromSeed(seed);
    mountedContainer = container;
    activeSessionId = createIdentifier("session");
    mountedInitialState = nextInitialState;
    replaceState(mountedInitialState, "mount");
  },

  async unmount() {
    mountedContainer = null;
    mountedInitialState = null;
  },

  subscribe(handler) {
    return workspaceBus.subscribe((event) => {
      handler({
        id: createIdentifier("event"),
        source: SOURCE_CONTROL_PLATFORM_DEFINITION.id,
        type: event.name,
        timestamp: new Date().toISOString(),
        sessionId: activeSessionId,
        payload: event.payload ?? {},
      });
    });
  },

  subscribeState(handler) {
    stateListeners.add(handler);
    return () => stateListeners.delete(handler);
  },

  query<T = unknown>(selector: string): Promise<T> {
    const selectors: Record<string, unknown> = {
      "platform.activeView": state.activeView,
      "platform.branch.current": state.currentBranch,
      "platform.branch.names": [...state.branches],
      "platform.pullRequest.created": state.pullRequestCreated,
      "platform.pullRequest.title": state.pullRequestTitle,
      "platform.pullRequest.description": state.pullRequestDescription,
      "platform.pullRequest.headBranch": state.pullRequestHeadBranch,
      "platform.pullRequest.diffViewed": state.diffViewed,
      "platform.pullRequest.reviewReplied": state.reviewReplied,
      "platform.pullRequest.checkStatus": state.checkStatus,
      "platform.pullRequest.mergeReady": state.mergeReady,
      "platform.issue.opened": state.issueOpened,
    };
    return Promise.resolve(selectors[selector] as T);
  },

  resolveTarget(ref) {
    if (!mountedContainer || !getSourceControlPlatformTarget(ref)) return null;
    return (
      mountedContainer
        .querySelector<HTMLElement>(`[data-highlight="${ref}"]`)
        ?.getBoundingClientRect() ?? null
    );
  },

  describeSurface(): RuntimeSurfaceDescription[] {
    return SOURCE_CONTROL_PLATFORM_DEFINITION.surface.map((entry) => ({ ...entry }));
  },

  snapshot() {
    return Promise.resolve(cloneState(state));
  },

  async restore(snapshot) {
    if (!isRuntimeState(snapshot)) throw new TypeError("Invalid source-control platform snapshot");
    replaceState(snapshot, "restore");
  },

  inspect(ref) {
    const item = getSourceControlPlatformTarget(ref);
    if (!item) return;
    workspaceBus.emit("ui.element.inspected", {
      ref,
      label: item.label,
      conceptKey: item.conceptKey,
    });
  },

  reset() {
    replaceState(mountedInitialState ?? initialState(), "reset");
  },

  openView(view) {
    mutate({ activeView: view, branchMenuOpen: false });
    const events = {
      overview: "platform.overview.opened",
      code: "platform.code.opened",
      commits: "platform.commit.history.opened",
      "pull-requests": "platform.pull_requests.opened",
      issues: "platform.issues.opened",
    } as const;
    workspaceBus.emit(events[view], { view });
  },

  setBranchMenuOpen(open) {
    mutate({ branchMenuOpen: open });
  },

  createBranch(name) {
    const branch = name.trim();
    if (!branch) return;
    mutate({
      currentBranch: branch,
      branches: state.branches.includes(branch) ? state.branches : [...state.branches, branch],
      branchMenuOpen: false,
    });
    workspaceBus.emit("platform.branch.created", { branch });
  },

  createPullRequest(title, description) {
    const headBranchChanged =
      state.pullRequestCreated && state.pullRequestHeadBranch !== state.currentBranch;
    const next = mutate({
      activeView: "pull-requests",
      pullRequestCreated: true,
      pullRequestTitle: title.trim(),
      pullRequestDescription: description.trim(),
      pullRequestHeadBranch: state.currentBranch,
      ...(!state.pullRequestCreated || headBranchChanged
        ? {
            diffViewed: false,
            reviewReplied: false,
            reviewReply: "",
            checkStatus: "pending" as const,
          }
        : {}),
    });
    workspaceBus.emit("platform.pull_request.created", {
      title: next.pullRequestTitle,
      description: next.pullRequestDescription,
      headBranch: next.pullRequestHeadBranch,
      baseBranch: "main",
    });
  },

  viewDiff() {
    const next = mutate({ activeView: "pull-requests", diffViewed: true });
    workspaceBus.emit("platform.pull_request.diff.opened", { viewed: next.diffViewed });
  },

  replyToReview(reply) {
    const normalizedReply = reply.trim();
    if (!normalizedReply) return;
    const next = mutate({ reviewReplied: true, reviewReply: normalizedReply });
    workspaceBus.emit("platform.pull_request.review.replied", {
      reply: next.reviewReply,
      resolved: true,
    });
  },

  completeChecks() {
    const next = mutate({ checkStatus: "success" });
    workspaceBus.emit("platform.pull_request.checks.opened", {
      status: next.checkStatus,
      mergeReady: next.mergeReady,
    });
  },

  inspectMergeReadiness() {
    workspaceBus.emit("platform.pull_request.merge_readiness.opened", {
      mergeReady: state.mergeReady,
    });
  },

  openIssue() {
    mutate({ activeView: "issues", issueOpened: true });
    workspaceBus.emit("platform.issue.opened", { number: 42 });
  },
};
