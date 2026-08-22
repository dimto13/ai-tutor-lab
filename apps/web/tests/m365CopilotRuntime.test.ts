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

    runtime.selectApp("word");
    runtime.setSourceApproved("project-brief", true);
    runtime.submitPrompt(COMPLETE_PROMPT);
    runtime.createDraft("word-draft");
    runtime.selectApp("teams");
    runtime.setSourceApproved("meeting-notes", true);
    runtime.createDraft("meeting-summary");
    runtime.rejectUnsupportedSuggestion();
    runtime.markFactsChecked();
    runtime.selectApp("outlook");
    runtime.createDraft("outlook-draft");
    runtime.decideApproval("approved");

    assert.equal(await runtime.query("m365.approvedSourceCount"), 2);
    assert.equal(await runtime.query("m365.prompt.qualityComplete"), true);
    assert.deepEqual(await runtime.query("m365.drafts.createdKinds"), [
      "word-draft",
      "meeting-summary",
      "outlook-draft",
    ]);
    assert.equal(await runtime.query("m365.draft.kind"), "outlook-draft");
    assert.equal(await runtime.query("m365.review.factsChecked"), true);
    assert.equal(await runtime.query("m365.review.unsupportedRejected"), true);
    assert.equal(await runtime.query("m365.approval.decision"), "approved");
  });

  it("never promotes an unapproved or unknown source into Copilot context", async () => {
    const runtime = createM365CopilotRuntime();
    const events: TrainingEvent[] = [];
    runtime.subscribe((event) => events.push(event));

    runtime.setSourceApproved("restricted-appendix", true);
    runtime.setSourceApproved("unknown-source", true);
    assert.equal(await runtime.query("m365.approvedSourceCount"), 0);

    runtime.setSourceApproved("meeting-notes", true);
    runtime.setSourceApproved("project-brief", true);
    assert.equal(await runtime.query("m365.approvedSourceCount"), 2);
    assert.equal(events.filter((event) => event.type === "m365.source.approval.denied").length, 2);
  });

  it("keeps document, meeting, mail and prompt contents out of runtime events", () => {
    const runtime = createM365CopilotRuntime();
    const events: TrainingEvent[] = [];
    runtime.subscribe((event) => events.push(event));

    runtime.setSourceApproved("meeting-notes", true);
    runtime.setSourceApproved("project-brief", true);
    runtime.submitPrompt(COMPLETE_PROMPT);
    runtime.createDraft("meeting-summary");
    runtime.createDraft("word-draft");
    runtime.createDraft("outlook-draft");
    runtime.markFactsChecked();
    runtime.rejectUnsupportedSuggestion();
    runtime.decideApproval("approved");

    const serialized = JSON.stringify(events);
    for (const forbidden of [
      "Pilotstart im Oktober",
      "Schulungstermin",
      "Das Budget ist bereits verbindlich freigegeben",
      "Betreff:",
      "Projektsteckbrief",
      "Besprechungsnotiz zusammenfassen",
    ]) {
      assert.equal(serialized.includes(forbidden), false, `event leaked content: ${forbidden}`);
    }

    assert.ok(events.length > 0);
    assert.ok(events.every((event) => event.source === "m365-copilot-simulator"));
    assert.ok(events.every((event) => event.sessionId.length > 0));
  });

  it("restores privacy-safe state and accepts snapshots from before draft-history tracking", async () => {
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

    assert.equal(await runtime.query("m365.activeApp"), "word");
    assert.deepEqual(await runtime.query("m365.drafts.createdKinds"), []);

    runtime.createDraft("outlook-draft");
    const snapshot = await runtime.snapshot();
    assert.deepEqual(snapshot.createdDraftKinds, ["outlook-draft"]);
    assert.equal("prompt" in snapshot, false);
    assert.equal("documentBody" in snapshot, false);
    assert.equal("mailBody" in snapshot, false);
  });
});
