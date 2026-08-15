import type { UiTargetRef } from "../types/training.ts";
import type { RuntimeSurfaceDescription } from "./runtimeAdapter.ts";
import type { RuntimeReferenceDefinition } from "./vscodeDefinition.ts";

/**
 * Semantic contract for the Claude Code CLI simulator.
 *
 * Claude Code is a standalone product rather than an integration inside another
 * host, so the definition intentionally omits `hostProductId`. The runtime keeps
 * its product vocabulary in `querySelectors`, while every scenario-visible
 * action maps onto the canonical training event vocabulary.
 */
export const CLAUDE_CODE_DEFINITION = {
  id: "claude-code-cli-simulator",
  productId: "claude-code",
  surface: [
    {
      ref: "claude.session.header",
      label: "Sitzungskopf",
      conceptKey: "cli_agent.session",
    },
    {
      ref: "claude.transcript",
      label: "Verlauf der Sitzung",
      conceptKey: "cli_agent.transcript",
    },
    {
      ref: "claude.prompt.input",
      label: "Eingabezeile",
      conceptKey: "cli_agent.prompt",
    },
    {
      ref: "claude.plan",
      label: "Vorgeschlagener Arbeitsplan",
      conceptKey: "cli_agent.plan",
    },
    {
      ref: "claude.diff",
      label: "Vorgeschlagene Dateiänderung",
      conceptKey: "cli_agent.proposed_change",
    },
    {
      ref: "claude.approval.approve",
      label: "Änderung freigeben",
      conceptKey: "cli_agent.permission",
    },
    {
      ref: "claude.approval.reject",
      label: "Änderung ablehnen",
      conceptKey: "cli_agent.permission",
    },
    {
      ref: "claude.workspace.files",
      label: "Dateien im Arbeitsverzeichnis",
      conceptKey: "cli_agent.workspace",
    },
  ],
  querySelectors: [
    "claude.session.active",
    "claude.session.model",
    "claude.cwd",
    "claude.transcript.entries",
    "claude.prompt.last",
    "claude.plan.steps",
    "claude.pendingChange.id",
    "claude.pendingChange.path",
    "claude.changes.viewed",
    "claude.changes.applied",
    "claude.changes.rejected",
    "claude.commands.executed",
    "claude.files",
    "claude.files.contents",
  ],
} as const satisfies RuntimeReferenceDefinition;

export function getClaudeCodeTarget(ref: UiTargetRef): RuntimeSurfaceDescription | null {
  return CLAUDE_CODE_DEFINITION.surface.find((entry) => entry.ref === ref) ?? null;
}
