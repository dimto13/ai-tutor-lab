import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createM365CopilotRuntime } from "../src/runtime/m365CopilotRuntime.ts";
import type { TrainingEvent } from "../src/types/training.ts";

const COMPLETE_PROMPT = {
  goal: true,
  context: true,
  audience: true,
  tone: true,
  outputFormat: true,
} as const;

describe("M365 Copilot runtime", () => {
  it("exposes semantic end state independent of interaction order", async () => {
    const runtime = createM365CopilotRuntime();

    runtime.setGroundingMode("web");
    runtime.setContextSource("project-brief", true);
    runtime.submitPrompt(COMPLETE_PROMPT);
    runtime.markFactsChecked();
    runtime.setGroundingMode("work");
    runtime.setContextSource("meeting-notes", true);
    runtime.rejectUnsupportedSuggestion();
    runtime.decideApproval("approved");

    assert.equal(await runtime.query("m365.grounding.mode"), "work");
    assert.equal(await runtime.query("m365.context.sourceCount"), 2);
    assert.equal(await runtime.query("m365.prompt.submitted"), true);
    assert.equal(await runtime.query("m365.prompt.qualityComplete"), true);
    assert.equal(await runtime.query("m365.chat.responseVisible"), true);
    assert.equal(await runtime.query("m365.review.factsChecked"), true);
    assert.equal(await runtime.query("m365.review.unsupportedRejected"), true);
    assert.equal(await runtime.query("m365.approval.decision"), "approved");
  });

  it("starts without prompt quality and derives it from the submitted request", async () => {
    const runtime = createM365CopilotRuntime();

    assert.equal(await runtime.query("m365.prompt.qualityComplete"), false);
    assert.equal(await runtime.query("m365.chat.responseVisible"), false);

    runtime.submitPrompt({ ...COMPLETE_PROMPT, audience: false });

    assert.equal(await runtime.query("m365.prompt.submitted"), true);
    assert.equal(await runtime.query("m365.prompt.qualityComplete"), false);
    assert.equal(await runtime.query("m365.chat.responseVisible"), true);
  });

  it("never promotes a restricted or unknown source into Copilot context", async () => {
    const runtime = createM365CopilotRuntime();
    const events: TrainingEvent[] = [];
    runtime.subscribe((event) => events.push(event));

    runtime.setContextSource("restricted-appendix", true);
    runtime.setContextSource("unknown-source", true);
    assert.equal(await runtime.query("m365.context.sourceCount"), 0);
    assert.equal(await runtime.query("m365.context.restrictedAttempted"), true);

    runtime.setContextSource("meeting-notes", true);
    runtime.setContextSource("project-brief", true);
    assert.equal(await runtime.query("m365.context.sourceCount"), 2);
    assert.equal(await runtime.query("m365.context.restrictedAttempted"), false);

    runtime.setContextSource("meeting-notes", false);
    assert.equal(await runtime.query("m365.context.sourceCount"), 1);
    assert.equal(events.filter((event) => event.type === "m365.context.denied").length, 2);
  });

  it("keeps synthetic document, answer and prompt contents out of runtime events", () => {
    const runtime = createM365CopilotRuntime();
    const events: TrainingEvent[] = [];
    runtime.subscribe((event) => events.push(event));

    runtime.setGroundingMode("work");
    runtime.setContextSource("meeting-notes", true);
    runtime.setContextSource("project-brief", true);
    runtime.setContextSource("restricted-appendix", true);
    runtime.submitPrompt(COMPLETE_PROMPT);
    runtime.markFactsChecked();
    runtime.rejectUnsupportedSuggestion();
    runtime.decideApproval("approved");

    const serialized = JSON.stringify(events);
    for (const forbidden of [
      "Der Pilot soll im Oktober starten",
      "Schulungstermin",
      "Das Budget ist bereits verbindlich freigegeben",
      "Deine Anfrage wurde gesendet",
    ]) {
      assert.equal(serialized.includes(forbidden), false, `event leaked content: ${forbidden}`);
    }

    const submitted = events.filter((event) => event.type === "m365.prompt.submitted");
    assert.equal(submitted.length, 1);
    assert.deepEqual(Object.keys(submitted[0]!.payload).sort(), [
      "contextSourceCount",
      "groundingMode",
      "qualityComplete",
    ]);

    assert.ok(events.length > 0);
    assert.ok(events.every((event) => event.source === "m365-copilot-simulator"));
    assert.ok(events.every((event) => event.sessionId.length > 0));
  });

  it("reports explored product chrome without mutating training state", async () => {
    const runtime = createM365CopilotRuntime();
    const events: TrainingEvent[] = [];
    runtime.subscribe((event) => events.push(event));

    runtime.inspect("m365.nav.agents");
    runtime.inspect("m365.result.sources");
    runtime.inspect("m365.unknown.target");

    const inspected = events.filter((event) => event.type === "ui.element.inspected");
    assert.deepEqual(
      inspected.map((event) => event.payload.ref),
      ["m365.nav.agents", "m365.result.sources"],
    );
    assert.equal(await runtime.query("m365.prompt.submitted"), false);
    assert.equal(await runtime.query("m365.approval.decision"), "pending");
  });

  it("restores privacy-safe state and rejects snapshots of the superseded app workflow", async () => {
    const runtime = createM365CopilotRuntime();

    await runtime.restore({
      activeApp: "word",
      approvedSourceIds: ["meeting-notes"],
      promptSubmitted: true,
      promptQuality: COMPLETE_PROMPT,
      draftKind: "word-draft",
      factsChecked: true,
      unsupportedRejected: true,
      approvalDecision: "pending",
    });
    assert.equal(await runtime.query("m365.prompt.submitted"), false);
    assert.equal(await runtime.query("m365.context.sourceCount"), 0);

    await runtime.restore({
      groundingMode: "work",
      contextSourceIds: ["meeting-notes"],
      restrictedSourceAttempted: false,
      promptSubmitted: true,
      promptQuality: COMPLETE_PROMPT,
      responseVisible: true,
      factsChecked: true,
      unsupportedRejected: true,
      approvalDecision: "pending",
    });

    assert.equal(await runtime.query("m365.context.sourceCount"), 1);
    assert.equal(await runtime.query("m365.chat.responseVisible"), true);

    const snapshot = await runtime.snapshot();
    assert.equal("prompt" in snapshot, false);
    assert.equal("documentBody" in snapshot, false);
    assert.equal("mailBody" in snapshot, false);
  });
});
