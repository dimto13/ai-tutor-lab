import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVITY_GAP_CAP_MS,
  ACTIVITY_HEARTBEAT_MS,
  applyValidationResult,
  completeChallenge,
  completeTrainingStep,
  createTrainingSession,
  inspectExploreTarget,
  recordHintUsage,
  recordLastAction,
  restoreTrainingSession,
} from "../src/stateMachine.ts";
import type { Scenario } from "../src/types.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const guided: Scenario = {
  id: "time.guided",
  mode: "guided",
  title: "Time",
  description: "",
  steps: ["one", "two", "three"].map((id) => ({
    id,
    title: id,
    description: "",
    instruction: id,
    helpLevels: ["a", "b", "c"] as [string, string, string],
    successMessage: "done",
  })),
};

test("a new session starts with no learning time", () => {
  const session = createTrainingSession(guided, guided.id, 1_000);
  assert.equal(session.activeMs, 0);
  assert.equal(session.lastActivityAt, 1_000);
});

test("an overnight break counts as a capped gap, not as hours (#582)", () => {
  let session = createTrainingSession(guided, guided.id, 0);
  session = completeTrainingStep(session, guided, "one", 3 * MINUTE);
  // The tab stays open overnight before the next step.
  session = applyValidationResult(
    session,
    guided,
    "two",
    { outcome: "pass" },
    3 * MINUTE + 20 * HOUR,
  );
  session = completeTrainingStep(session, guided, "three", 3 * MINUTE + 20 * HOUR + 2 * MINUTE);

  assert.notEqual(session.finishedAt, null);
  assert.equal(session.activeMs, 3 * MINUTE + ACTIVITY_GAP_CAP_MS + 2 * MINUTE);
  assert.ok((session.finishedAt ?? 0) - session.startedAt > 20 * HOUR);
});

test("near-misses and help requests are learner actions too", () => {
  let session = createTrainingSession(guided, guided.id, 0);
  session = applyValidationResult(session, guided, "one", { outcome: "near-miss" }, 2 * MINUTE);
  session = recordHintUsage(session, "one", 1, 5 * MINUTE);
  assert.equal(session.activeMs, 5 * MINUTE);
  assert.equal(session.lastActivityAt, 5 * MINUTE);
});

test("a finished session keeps its learning time", () => {
  let session = createTrainingSession({ ...guided, steps: guided.steps.slice(0, 1) }, "one", 0);
  session = completeTrainingStep(
    session,
    { ...guided, steps: guided.steps.slice(0, 1) },
    "one",
    MINUTE,
  );
  const finished = recordLastAction(session, "ui.clicked", 5 * HOUR);
  assert.equal(finished.activeMs, MINUTE);
});

test("repeated events of one type update the learning time at most once per heartbeat", () => {
  let session = recordLastAction(
    createTrainingSession(guided, guided.id, 0),
    "file.updated",
    1_000,
  );
  const sameTypeSoon = recordLastAction(session, "file.updated", 1_000 + ACTIVITY_HEARTBEAT_MS - 1);
  assert.equal(sameTypeSoon, session, "no new session, so no extra write");

  session = recordLastAction(session, "file.updated", 1_000 + ACTIVITY_HEARTBEAT_MS);
  assert.equal(session.activeMs, 1_000 + ACTIVITY_HEARTBEAT_MS);

  const otherType = recordLastAction(session, "terminal.command", session.lastActivityAt + 500);
  assert.equal(otherType.lastAction, "terminal.command");
  assert.equal(otherType.activeMs, (session.activeMs ?? 0) + 500);
});

test("challenge and explore runs measure learning time without attempts", () => {
  const challenge: Scenario = { ...guided, id: "time.challenge", mode: "challenge" };
  let run = createTrainingSession(challenge, challenge.id, 0);
  run = recordLastAction(run, "file.updated", 4 * MINUTE);
  run = completeChallenge(run, challenge, 9 * MINUTE);
  assert.equal(run.activeMs, 9 * MINUTE);

  const explore: Scenario = {
    ...guided,
    id: "time.explore",
    mode: "explore",
    exploreTargets: ["a", "b"],
  };
  let tour = createTrainingSession(explore, explore.id, 0);
  tour = inspectExploreTarget(tour, explore, "a", MINUTE);
  tour = inspectExploreTarget(tour, explore, "b", 3 * HOUR);
  assert.notEqual(tour.finishedAt, null);
  assert.equal(tour.activeMs, MINUTE + ACTIVITY_GAP_CAP_MS);
});

test("a restored session keeps its learning time and caps the gap since the last action", () => {
  let session = completeTrainingStep(
    createTrainingSession(guided, "s", 0),
    guided,
    "one",
    4 * MINUTE,
  );
  const stored = JSON.parse(JSON.stringify(session));
  session = restoreTrainingSession(guided, "s", stored, 8 * HOUR);
  assert.equal(session.activeMs, 4 * MINUTE);

  session = completeTrainingStep(session, guided, "two", 8 * HOUR);
  assert.equal(session.activeMs, 4 * MINUTE + ACTIVITY_GAP_CAP_MS);
});

test("a session stored before #582 has unknown learning time, also after more actions", () => {
  const legacy = JSON.parse(JSON.stringify(createTrainingSession(guided, "s", 0)));
  delete legacy.activeMs;
  delete legacy.lastActivityAt;

  let session = restoreTrainingSession(guided, "s", legacy, 20 * HOUR);
  assert.equal(session.activeMs, null);
  session = completeTrainingStep(session, guided, "one", 20 * HOUR + MINUTE);
  assert.equal(session.activeMs, null);
});

test("implausible stored learning time is treated as unknown", () => {
  const stored = JSON.parse(JSON.stringify(createTrainingSession(guided, "s", 10 * MINUTE)));
  for (const broken of [{ activeMs: -1 }, { activeMs: "5" }, { lastActivityAt: 0 }]) {
    const session = restoreTrainingSession(guided, "s", { ...stored, ...broken }, HOUR);
    assert.equal(session.activeMs, null, JSON.stringify(broken));
  }
});

test("a last action stored in the future does not pause the measurement", () => {
  // Another device with its clock an hour ahead saved the session.
  const ahead = completeTrainingStep(
    createTrainingSession(guided, "s", 0),
    guided,
    "one",
    2 * HOUR,
  );
  const stored = JSON.parse(JSON.stringify(ahead));

  let session = restoreTrainingSession(guided, "s", stored, HOUR);
  assert.equal(session.lastActivityAt, HOUR);
  session = completeTrainingStep(session, guided, "two", HOUR + 2 * MINUTE);
  assert.equal(session.activeMs, (ahead.activeMs ?? 0) + 2 * MINUTE);
});
