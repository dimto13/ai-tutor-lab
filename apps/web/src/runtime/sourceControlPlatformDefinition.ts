import type { UiTargetRef } from "../types/training.ts";
import type { RuntimeSurfaceDescription } from "./runtimeAdapter.ts";
import type { RuntimeReferenceDefinition } from "./vscodeDefinition.ts";

/**
 * Semantic contract for a hosted source-control platform simulator.
 *
 * Product names stay in scenario data. The training engine only sees stable
 * targets and selectors that can also be implemented by another adapter.
 */
export const SOURCE_CONTROL_PLATFORM_DEFINITION = {
  id: "source-control-platform-simulator",
  productId: "github",
  surface: [
    {
      ref: "platform.repository.header",
      label: "Repository-Kopf",
      conceptKey: "platform.repository",
    },
    {
      ref: "platform.navigation.overview",
      label: "Git-und-Plattform-Überblick",
      conceptKey: "git.github_difference",
    },
    {
      ref: "platform.navigation.code",
      label: "Code-Ansicht",
      conceptKey: "git.working_tree",
    },
    {
      ref: "platform.branch.selector",
      label: "Branch-Auswahl",
      conceptKey: "platform.branch_selector",
    },
    {
      ref: "platform.commit.history",
      label: "Commit-Historie",
      conceptKey: "platform.commit_history",
    },
    {
      ref: "platform.pullRequests",
      label: "Pull Requests",
      conceptKey: "platform.pull_request",
    },
    {
      ref: "platform.pullRequest.diff",
      label: "Änderungsvergleich",
      conceptKey: "platform.diff",
    },
    {
      ref: "platform.pullRequest.review",
      label: "Review-Unterhaltung",
      conceptKey: "platform.review",
    },
    {
      ref: "platform.pullRequest.checks",
      label: "Status Checks",
      conceptKey: "platform.status_checks",
    },
    {
      ref: "platform.issues",
      label: "Issues",
      conceptKey: "platform.issues",
    },
    {
      ref: "platform.remote.help",
      label: "Clone, Fork und Remote",
      conceptKey: "platform.remote",
    },
  ],
  querySelectors: [
    "platform.activeView",
    "platform.branch.current",
    "platform.branch.names",
    "platform.pullRequest.created",
    "platform.pullRequest.title",
    "platform.pullRequest.description",
    "platform.pullRequest.headBranch",
    "platform.pullRequest.diffViewed",
    "platform.pullRequest.reviewReplied",
    "platform.pullRequest.checkStatus",
    "platform.pullRequest.mergeReady",
    "platform.issue.opened",
  ],
} as const satisfies RuntimeReferenceDefinition;

export function getSourceControlPlatformTarget(ref: UiTargetRef): RuntimeSurfaceDescription | null {
  return SOURCE_CONTROL_PLATFORM_DEFINITION.surface.find((entry) => entry.ref === ref) ?? null;
}
