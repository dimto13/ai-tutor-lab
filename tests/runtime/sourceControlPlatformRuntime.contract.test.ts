import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sourceControlPlatformRuntime,
  type SourceControlPlatformState,
} from "../../apps/web/src/runtime/sourceControlPlatformRuntime.ts";
import { defineRuntimeAdapterContractTests } from "./runtimeAdapter.contract.ts";

const targetRef = "platform.navigation.code";
const targetRect = {
  x: 18,
  y: 32,
  top: 32,
  right: 158,
  bottom: 72,
  left: 18,
  width: 140,
  height: 40,
  toJSON: () => ({}),
} as DOMRect;

function createContainer(): HTMLElement {
  const target = { getBoundingClientRect: () => targetRect };
  return {
    querySelector: (selector: string) =>
      selector === `[data-highlight="${targetRef}"]` ? target : null,
  } as unknown as HTMLElement;
}

defineRuntimeAdapterContractTests("sourceControlPlatformRuntime", () => {
  let restoredPresentation: SourceControlPlatformState | null = null;
  let unsubscribeState: (() => void) | null = null;

  return {
    adapter: sourceControlPlatformRuntime,
    reset: () => {
      unsubscribeState?.();
      unsubscribeState = null;
      restoredPresentation = null;
      sourceControlPlatformRuntime.reset();
    },
    target: {
      ref: targetRef,
      container: createContainer(),
      expectedRect: targetRect,
    },
    event: {
      name: "platform.commit.history.opened",
      emit: () => sourceControlPlatformRuntime.openView("commits"),
    },
    query: {
      selector: "platform.branch.current",
      expected: "main",
    },
    seed: {
      seed: {
        platformName: "Test Platform",
        repositoryOwner: "training",
        repositoryName: "sample",
        currentBranch: "feature/seeded",
        branches: ["main", "feature/seeded"],
      },
      selector: "platform.branch.current",
      expected: "feature/seeded",
    },
    snapshot: {
      selector: "platform.branch.current",
      expectedRestoredValue: "feature/snapshot",
      prepare: () => {
        sourceControlPlatformRuntime.createBranch("feature/snapshot");
        unsubscribeState = sourceControlPlatformRuntime.subscribeState((runtimeState, reason) => {
          if (reason === "restore") restoredPresentation = runtimeState;
        });
      },
      mutate: () => sourceControlPlatformRuntime.createBranch("feature/mutated"),
      assertRestoredPresentation: () => {
        assert.ok(restoredPresentation);
        assert.equal(restoredPresentation.currentBranch, "feature/snapshot");
        assert.deepEqual(restoredPresentation.branches, ["main", "feature/snapshot"]);
        unsubscribeState?.();
        unsubscribeState = null;
      },
    },
  };
});

test("sourceControlPlatformRuntime: exposes scenario-authored repository and review content", async () => {
  await sourceControlPlatformRuntime.mount(createContainer(), {
    repositoryFiles: ["TRAINING.md"],
    commitHistory: [["abc1234", "Szenarioinhalt", "Ada"]],
    latestCommitRelativeTime: "gerade eben",
    diffFilePath: "TRAINING.md",
    diffContextOldLine: "1",
    diffContextNewLine: "1",
    diffContextText: "# Alt",
    diffAddedNewLine: "2",
    diffAddedText: "+ Neu",
    reviewAuthor: "Reviewer",
    reviewBody: "Bitte prüfen.",
  });
  try {
    const snapshot = (await sourceControlPlatformRuntime.snapshot()) as SourceControlPlatformState;
    assert.deepEqual(snapshot.repositoryFiles, ["TRAINING.md"]);
    assert.deepEqual(snapshot.commitHistory, [["abc1234", "Szenarioinhalt", "Ada"]]);
    assert.equal(snapshot.diffFilePath, "TRAINING.md");
    assert.equal(snapshot.reviewAuthor, "Reviewer");
    assert.equal(snapshot.reviewBody, "Bitte prüfen.");
  } finally {
    await sourceControlPlatformRuntime.unmount();
  }
});

test("sourceControlPlatformRuntime: computes merge readiness from final state, independent of action order", async () => {
  await sourceControlPlatformRuntime.mount(createContainer());
  try {
    sourceControlPlatformRuntime.createBranch("feature/readme-guide");
    sourceControlPlatformRuntime.createPullRequest(
      "README um Einstieg ergänzen",
      "Links und Einrichtung geprüft.",
    );

    sourceControlPlatformRuntime.completeChecks();
    sourceControlPlatformRuntime.replyToReview("Inhalte geprüft; keine Zugangsdaten enthalten.");
    sourceControlPlatformRuntime.viewDiff();

    assert.equal(
      await sourceControlPlatformRuntime.query("platform.branch.current"),
      "feature/readme-guide",
    );
    assert.equal(
      await sourceControlPlatformRuntime.query("platform.pullRequest.headBranch"),
      "feature/readme-guide",
    );
    assert.equal(await sourceControlPlatformRuntime.query("platform.pullRequest.diffViewed"), true);
    assert.equal(
      await sourceControlPlatformRuntime.query("platform.pullRequest.reviewReplied"),
      true,
    );
    assert.equal(
      await sourceControlPlatformRuntime.query("platform.pullRequest.checkStatus"),
      "success",
    );
    assert.equal(await sourceControlPlatformRuntime.query("platform.pullRequest.mergeReady"), true);
  } finally {
    await sourceControlPlatformRuntime.unmount();
  }
});

test("sourceControlPlatformRuntime: lets learners correct pull request data and review replies", async () => {
  await sourceControlPlatformRuntime.mount(createContainer());
  try {
    sourceControlPlatformRuntime.createPullRequest("First try", "Prüfung folgt.");
    sourceControlPlatformRuntime.replyToReview("Erledigt.");
    sourceControlPlatformRuntime.createBranch("feature/readme-guide");
    sourceControlPlatformRuntime.createPullRequest(
      "README um Einstieg ergänzen",
      "Einrichtung geprüft; keine Zugangsdaten enthalten.",
    );
    sourceControlPlatformRuntime.replyToReview(
      "Links und Inhalte geprüft; keine Zugangsdaten enthalten.",
    );

    const corrected = (await sourceControlPlatformRuntime.snapshot()) as SourceControlPlatformState;
    assert.equal(corrected.pullRequestHeadBranch, "feature/readme-guide");
    assert.equal(
      corrected.pullRequestDescription,
      "Einrichtung geprüft; keine Zugangsdaten enthalten.",
    );
    assert.equal(corrected.reviewReply, "Links und Inhalte geprüft; keine Zugangsdaten enthalten.");
    assert.equal(corrected.reviewReplied, true);
  } finally {
    await sourceControlPlatformRuntime.unmount();
  }
});

test("sourceControlPlatformRuntime: preserves completed review work for metadata-only edits", async () => {
  await sourceControlPlatformRuntime.mount(createContainer());
  try {
    sourceControlPlatformRuntime.createBranch("feature/readme-guide");
    sourceControlPlatformRuntime.createPullRequest("First try", "Prüfung folgt.");
    sourceControlPlatformRuntime.completeChecks();
    sourceControlPlatformRuntime.replyToReview("Links und Inhalte geprüft.");
    sourceControlPlatformRuntime.viewDiff();

    sourceControlPlatformRuntime.createPullRequest(
      "README um Einstieg ergänzen",
      "Einrichtung geprüft; keine Zugangsdaten enthalten.",
    );
    const metadataEdit =
      (await sourceControlPlatformRuntime.snapshot()) as SourceControlPlatformState;
    assert.equal(metadataEdit.diffViewed, true);
    assert.equal(metadataEdit.reviewReplied, true);
    assert.equal(metadataEdit.reviewReply, "Links und Inhalte geprüft.");
    assert.equal(metadataEdit.checkStatus, "success");
    assert.equal(metadataEdit.mergeReady, true);

    sourceControlPlatformRuntime.createBranch("feature/other-change");
    sourceControlPlatformRuntime.createPullRequest(
      "Anderer Änderungsvorschlag",
      "Einrichtung geprüft.",
    );
    const branchEdit =
      (await sourceControlPlatformRuntime.snapshot()) as SourceControlPlatformState;
    assert.equal(branchEdit.diffViewed, false);
    assert.equal(branchEdit.reviewReplied, false);
    assert.equal(branchEdit.reviewReply, "");
    assert.equal(branchEdit.checkStatus, "pending");
    assert.equal(branchEdit.mergeReady, false);
  } finally {
    await sourceControlPlatformRuntime.unmount();
  }
});

test("sourceControlPlatformRuntime: rejects invalid seeds and snapshots", async () => {
  await assert.rejects(
    () => sourceControlPlatformRuntime.mount(createContainer(), { branches: "main" }),
    /Invalid source-control platform runtime seed field: branches/,
  );
  await assert.rejects(
    () => sourceControlPlatformRuntime.restore({ currentBranch: "main" }),
    /Invalid source-control platform snapshot/,
  );
});
