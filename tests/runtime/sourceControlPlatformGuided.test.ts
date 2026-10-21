import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createDefaultValidatorRegistry, stepFailureMessage } from "@ai-train-lab/training-engine";
import type { TrainingEvent } from "@ai-train-lab/training-engine";
import { sourceControlPlatformRuntime } from "../../apps/web/src/runtime/sourceControlPlatformRuntime.ts";
import { parseScenario } from "../../apps/web/src/scenarios/contentLoader.ts";

// Drives the authored Guided steps of #591 against the real simulator, without a browser.
const raw = await readFile(
  path.resolve("content/scenarios/source-control-platform-basics.guided.json"),
  "utf8",
);
const scenario = parseScenario(JSON.parse(raw));
const registry = createDefaultValidatorRegistry();
const query = (selector: string) => sourceControlPlatformRuntime.query(selector);

function step(id: string) {
  const found = scenario.steps.find((candidate) => candidate.id === id);
  assert.ok(found, id);
  return found;
}

async function withRuntime(run: (events: TrainingEvent[]) => Promise<void>): Promise<void> {
  const container = { querySelector: () => null } as unknown as HTMLElement;
  await sourceControlPlatformRuntime.mount(container, scenario.environment?.seed);
  const events: TrainingEvent[] = [];
  const unsubscribe = sourceControlPlatformRuntime.subscribe((event) => events.push(event));
  try {
    await run(events);
  } finally {
    unsubscribe();
    await sourceControlPlatformRuntime.unmount();
  }
}

async function validateLatest(stepId: string, events: TrainingEvent[]) {
  const validation = step(stepId).validation;
  assert.ok(validation);
  return registry.validate(validation, { event: events.at(-1), query });
}

async function recoveryOffered(stepId: string): Promise<boolean> {
  for (const rule of step(stepId).recovery?.stateRules ?? []) {
    if ((await registry.validate(rule.when, { query })).outcome === "pass") return true;
  }
  return false;
}

test("#591: the beta tester's description completes step 5", async () => {
  await withRuntime(async (events) => {
    sourceControlPlatformRuntime.createBranch("feature/readme-guide");
    sourceControlPlatformRuntime.createPullRequest(
      "README um Einstieg ergänzen",
      "Prüfung der Änderung.",
    );
    assert.equal((await validateLatest("create-pull-request", events)).outcome, "pass");
  });
});

test("#591: a too short description says what is missing and offers the edit form", async () => {
  await withRuntime(async (events) => {
    const createPullRequest = step("create-pull-request");
    sourceControlPlatformRuntime.createBranch("feature/readme-guide");
    sourceControlPlatformRuntime.createPullRequest("README um Einstieg ergänzen", "Prüfung folgt.");

    const result = await validateLatest(createPullRequest.id, events);
    assert.equal(result.outcome, "near-miss");
    assert.equal(
      stepFailureMessage(createPullRequest, result),
      createPullRequest.onFailure?.fieldMessages?.["description"],
    );
    assert.equal(createPullRequest.onFailure?.markTarget, "platform.pullRequest.edit");
    assert.equal(await recoveryOffered(createPullRequest.id), true);

    const action = createPullRequest.recovery?.stateRules?.[0]?.action;
    assert.ok(action?.command);
    assert.equal(action.label, "Pull Request bearbeiten");
    assert.deepEqual(await sourceControlPlatformRuntime.recover(action.command), {
      status: "repaired",
    });
    assert.equal(await recoveryOffered(createPullRequest.id), false);

    sourceControlPlatformRuntime.createPullRequest(
      "README um Einstieg ergänzen",
      "Ergänzt den Einstieg; Link geprüft und keine Zugangsdaten gefunden.",
    );
    assert.equal((await validateLatest(createPullRequest.id, events)).outcome, "pass");
  });
});

test("#591: a pull request created ahead of step 5 can still finish it", async () => {
  await withRuntime(async (events) => {
    // A curious learner creates the pull request while step 2 is active, from main.
    sourceControlPlatformRuntime.createPullRequest("README um Einstieg ergänzen", "Erster Entwurf");
    sourceControlPlatformRuntime.createBranch("feature/readme-guide");
    sourceControlPlatformRuntime.openView("commits");

    // Step 5 now starts on an existing pull request: the guide offers its edit form.
    assert.equal(await recoveryOffered("create-pull-request"), true);
    const command = step("create-pull-request").recovery?.stateRules?.[0]?.action.command;
    assert.ok(command);
    await sourceControlPlatformRuntime.recover(command);
    sourceControlPlatformRuntime.createPullRequest(
      "README um Einstieg ergänzen",
      "Ergänzt den Einstieg für neue Teammitglieder.",
    );
    assert.equal((await validateLatest("create-pull-request", events)).outcome, "pass");
  });
});

test("#591: a one-word review reply asks for a sentence, any own sentence finishes the step", async () => {
  await withRuntime(async (events) => {
    const reply = step("reply-to-review");
    sourceControlPlatformRuntime.replyToReview("Erledigt.");
    const short = await validateLatest(reply.id, events);
    assert.equal(short.outcome, "near-miss");
    assert.equal(stepFailureMessage(reply, short), reply.onFailure?.message);

    sourceControlPlatformRuntime.replyToReview("Habe ich überprüft, passt alles.");
    assert.equal((await validateLatest(reply.id, events)).outcome, "pass");
  });
});
